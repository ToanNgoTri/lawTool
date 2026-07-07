// ─── Orchestration: gom logic vốn nằm ở nextLawTool/app/once/page.js ───────────
// (getValueinArea + getInfo + clickToConvertContent) để chạy server-side.

const convert = require("./convert");
const ObjectLawPair = require("./ObjectLawPair.json");

// Port getValueinArea(): chuẩn hoá các trường thô + dựng lawNameDisplay.
function prepFields(raw) {
  const unitPublish = String(raw.unitPublish || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const lawDaySign = String(raw.lawDaySign || "").replace(/\s/g, "");
  const nameSign = String(raw.nameSign || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const lawDescription = String(raw.lawDescription || "");
  const lawNumber = String(raw.lawNumber || "").replace(/\s/g, "");
  const lawKind = String(raw.lawKind || "").replace(/(^\s*|\s*$)/g, "");

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

  const contentText = String(raw.content || "").replace(/(^\s*|\s*$)/gim, "");

  return { unitPublish, lawDaySign, nameSign, lawDescription, lawNumber, lawKind, lawNameDisplay, contentText };
}

// Port getInfo() + clickToConvertContent(): trả về mọi thứ cần để review + push.
async function processLaw(raw) {
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
