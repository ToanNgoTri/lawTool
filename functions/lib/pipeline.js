// ─── Orchestration: gom logic vốn nằm ở nextLawTool/app/once/page.js ───────────
// (getValueinArea + getInfo + clickToConvertContent) để chạy server-side.

const convert = require("./convert");
// ObjectLawPair KHÔNG còn bundle sẵn từ JSON. Bản đồ tra "luật liên quan" giờ
// dựng từ Mongo (LawMachine.LawSearchDescription) để web + RN dùng chung, luôn
// cập nhật. index.js nạp/cache map rồi truyền vào processLaw().

// Port getValueinArea(): chuẩn hoá các trường thô + dựng lawNameDisplay.
function prepFields(raw) {
  const lawKind = String(raw.lawKind || "").replace(/(^\s*|\s*$)/g, "");

  // Tách cơ quan ban hành / tên người ký (khớp nextLawTool splitUnitOrName):
  //  - Thông tư LIÊN TỊCH: các cơ quan/tên phân tách bằng dấu ",". Riêng
  //    "Bộ Văn hóa, Thể thao và Du lịch" có sẵn dấu phẩy trong tên -> tạm thay bằng
  //    placeholder để không bị tách nhầm, xong khôi phục lại.
  //  - Các loại khác: tách bằng ";" như cũ.
  const splitUnitOrName = (text) => {
    const s = String(text || "");
    if (/liên tịch/i.test(lawKind)) {
      const PLACEHOLDER = "__VHTTDL__";
      return s
        .replace(/Bộ Văn hóa, Thể thao và Du lịch/gi, (m) => m.replace(/,/g, PLACEHOLDER))
        .split(/[,]/)
        .map((item) => item.replace(new RegExp(PLACEHOLDER, "g"), ",").trim())
        .filter(Boolean);
    }
    return s.split(/[;]/).map((item) => item.trim()).filter(Boolean);
  };

  const unitPublish = splitUnitOrName(raw.unitPublish);
  const lawDaySign = String(raw.lawDaySign || "").replace(/\s/g, "");
  const nameSign = splitUnitOrName(raw.nameSign);
  const lawDescription = String(raw.lawDescription || "");
  const lawNumber = String(raw.lawNumber || "").replace(/\s/g, "");

  const yearMatch = lawDaySign.match(/\d+$/);
  const year = yearMatch ? yearMatch[0] : "";

  let lawNameDisplay = lawDescription;
  if (/^(luật|bộ luật)/i.test(lawKind)) {
    lawNameDisplay = lawDescription.replace(/,* của Quốc hội.*số.*/i, "");
    lawNameDisplay = `${lawKind} ${lawNameDisplay} năm ${year}`;
  } else if (/hợp nhất$/gim.test(lawKind) && /(Bộ )*Luật.*/gim.test(lawNameDisplay)) {
    lawNameDisplay = `${lawNameDisplay.match(/(Bộ )*Luật.*/gim)[0]} hợp nhất năm ${year}`;
  } else {
    lawNameDisplay = `${lawKind} số ${lawNumber}`;
  }

  // Chỉ chuẩn hoá khoảng trắng NGANG đầu/cuối mỗi dòng (giữ nguyên \n và dòng
  // trống). KHÔNG dùng /(^\s*|\s*$)/gim: \s gồm cả \n nên nó xoá luôn các dòng
  // trống -> dồn "BỘ TRƯỞNG" và tên người ký vào 1 dòng -> getRoleSign (tìm chức
  // vụ ở dòng ngay trên tên) trả về rỗng khi dồn cả văn bản vào field content.
  const contentText = String(raw.content || "")
    .replace(/[^\S\n]+$/gm, "")
    .replace(/^[^\S\n]+/gm, "")
    .trim();

  return { unitPublish, lawDaySign, nameSign, lawDescription, lawNumber, lawKind, lawNameDisplay, contentText };
}

// Port getInfo() + clickToConvertContent(): trả về mọi thứ cần để review + push.
// objectLawPair: bản đồ tra luật liên quan, do index.js nạp từ Mongo và truyền vào.
async function processLaw(raw, objectLawPair) {
  const ObjectLawPair = objectLawPair || {};
  const f = prepFields(raw);
  const roleSignText = String(raw.roleSign || "");
  const lawRelatedText = String(raw.lawRelated || "");

  let result;
  if (roleSignText && lawRelatedText) {
    result = await convert.getNormalTextInfo(
      f.contentText, roleSignText, lawRelatedText, f.lawNumber, f.nameSign,
      ObjectLawPair, f.lawDaySign, f.lawNameDisplay, f.lawDescription, f.lawKind, f.unitPublish,
    );
  } else {
    result = await convert.convertBareTextInfo(
      f.contentText, lawRelatedText, f.lawNumber, f.nameSign, f.lawKind,
      f.unitPublish, ObjectLawPair, f.lawDaySign, f.lawNameDisplay, f.lawDescription,
    );
  }

  const lawInfo = result.lawInfo;
  // Với luật thì lấy lawNameDisplay đã tính (port dòng setLawNameDisplayText trong once page).
  if (/luật/gim.test(lawInfo.lawKind || "")) lawInfo.lawNameDisplay = f.lawNameDisplay;

  // Cho phép override lawDayActive (ngày hiệu lực) nếu người dùng nhập tay ở màn sửa.
  if (raw.lawDayActive && String(raw.lawDayActive).trim()) {
    lawInfo.lawDayActive = String(raw.lawDayActive).trim();
  }

  const output = result.partTwo;
  const isOfficial = /^\d+\/(TAND|VKS).+\-/gim.test(lawInfo.lawNumber || "");
  const converted = isOfficial
    ? convert.convertContentOfficialDispatch(output)
    : convert.convertContent(output);

  const lawNumberForPush = convert.createNameLawForPush(lawInfo);

  const lawInfoPush = lawInfo;
  console.log("lawDayActive", lawInfoPush.lawDayActive);
  console.log("lawDaySign", lawInfoPush.lawDaySign);
  console.log("lawKind", lawInfoPush.lawKind);
  console.log("lawNumber", lawInfoPush.lawNumber);
  console.log("lawNameDisplay", lawInfoPush.lawNameDisplay);
  console.log("lawDescription", lawInfoPush.lawDescription);
  console.log("unitPublish", lawInfoPush.unitPublish);
  console.log("nameSign", lawInfoPush.nameSign);
  console.log("roleSign", lawInfoPush.roleSign);
  console.log("lawRelated", lawInfoPush.lawRelated);

  return {
    lawInfo,
    output,
    fullText: converted.fullText,
    data: converted.data,
    lawNumberForPush,
  };
}

module.exports = { prepFields, processLaw };
