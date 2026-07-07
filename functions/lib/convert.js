// NOTE (port sang Firebase Functions):
// - beep()/addJSONFile()/Push() phụ thuộc trình duyệt -> đã loại bỏ.
// - embedText() đổi sang Ollama remote.
// - Các biến module-level bên dưới (lawInfo, roleSign...) bị convertBareTextInfo
//   ghi đè -> hàm xử lý phải chạy với concurrency = 1 (xem index.js).
let lawInfo = {};
let roleSign = [];

let lawDayActive;
let unitPublish;
let nameSign;
let lawRelated;
let lawKind;
let contentText;

function addDaysToDate(dateStr, daysToAdd) {
  // Tách chuỗi dd/mm/yyyy thành các phần (ngày, tháng, năm)
  let parts = dateStr.split("/"); // parts[0] là ngày, parts[1] là tháng, parts[2] là năm

  // Tạo đối tượng Date từ ngày tháng năm (lưu ý tháng trong JavaScript bắt đầu từ 0)
  let date = new Date(parts[2], parts[1] - 1, parts[0]);

  // Cộng thêm số ngày vào đối tượng Date
  date.setDate(date.getDate() + daysToAdd);

  // Trả về ngày mới sau khi cộng thêm
  return date;
}

function getRoleSign(contentRoleSign, nameSign) {
  contentRoleSign = contentRoleSign.replace(/\n\(*đã k(ý|í)\)*/gim, "");
  contentRoleSign = contentRoleSign.replace(/\n\[daky\]/gim, "");

  let roleSign = [];

  for (let a = 0; a < nameSign.length; a++) {
    // console.log('nameSign',nameSign);

    // Chuẩn hoá trước khi gộp: CRLF -> LF; mọi khoảng trắng-ngang KỂ CẢ &nbsp;
    // ( ) -> 1 space; trim quanh xuống dòng; gộp dòng trống. Nếu không, dòng
    // trống chứa nbsp/space (hoặc \r) sẽ không bị gộp -> "dòng ngay trên tên"
    // thành dòng rỗng -> roleSign ra rỗng thay vì chức vụ (vd "BỘ TRƯỞNG").
    // [^\S\n] = mọi ký tự khoảng trắng trừ \n (space, tab, \r,  , ...).
    contentRoleSign = contentRoleSign
      .replace(/\r\n?/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n+/g, "\n");

    // console.log(contentRoleSign,nameSign[a])
    // Không tìm thấy dòng chức vụ trước tên (vd Dự thảo không có người ký) -> để trống, không sập.
    // Chuẩn hoá khoảng trắng trong tên (nbsp giữa các chữ) để khớp với text đã chuẩn hoá.
    const _name = String(nameSign[a]).replace(/\s+/g, " ").trim();
    const _rsMatch = contentRoleSign.match(new RegExp(`.*(?=\n.*${_name})`, "img"));
    if (!_rsMatch) {
      roleSign.push("");
      continue;
    }
    let roleSignString = _rsMatch[0].toLowerCase(); //key.charAt(0).toUpperCase() + key.slice(1);

    roleSignString =
      roleSignString.charAt(0).toUpperCase() + roleSignString.slice(1);

    if (roleSignString.match(/^phó/i)) {
      roleSignString =
        "Phó " +
        roleSignString.charAt(4).toUpperCase() +
        roleSignString.slice(5);
    } else if (roleSignString.match(/quốc hội/i)) {
      roleSignString = roleSignString.replace(/quốc hội/i, "Quốc hội");
    } else if (roleSignString.match(/chủ nhiệm/i)) {
      roleSignString = roleSignString.replace(/chủ nhiệm/i, "Chủ nhiệm");
    }
    roleSignString = roleSignString.replace(/\s/gm, " ");
    roleSign.push(roleSignString);
  }
  // console.log('roleSign', roleSign);

  return roleSign;
}

function getArrangeUnitPublic(
  roleSignString,
  nameSignArrayDemo,
  lawKind,
  unitPublish,
) {
  let nameSign = [];
  let unitPbDemo = [];
  // console.log('roleSignString', roleSignString);

  nameSignArrayDemo.map((nameSignDemo, i) => {
    // Không tìm thấy tên người ký trong text (vd Dự thảo) -> dùng tạm nameSignDemo, không sập.
    const _nm = roleSignString.match(new RegExp(`.*${nameSignDemo}.*`, "img"));
    let nameSignString = _nm ? _nm[0] : nameSignDemo;

    nameSign.push(nameSignString);
    const _ne = roleSignString.match(
      new RegExp(`(\.*\\n){0,3}\.*${nameSignDemo}\.*`, "img"),
    );
    let nameSignStringEffectArea = _ne ? _ne[0] : nameSignDemo;
    //    let nameSignStringEffectArea = roleSignString.match(new RegExp(`${roleSignString.match(new RegExp(`(\.*\\n){0,3}\.*${nameSignDemo}\.*`,'img'))[0]  }`,'img'))[0]
    nameSignStringEffectArea = nameSignStringEffectArea.replace(/\n/gim, " ");
    if (lawKind.match(/liên tịch/i)) {
      for (let b = 0; b < unitPublish.length; b++) {
        // console.log(unitPublish[b]);

        if (
          nameSignStringEffectArea.match(
            new RegExp(`${unitPublish[b].slice(0, 6)}`, "igm"),
          ) &&
          nameSignStringEffectArea.match(
            new RegExp(
              `${unitPublish[b].slice(
                unitPublish[b].length - 6,
                unitPublish[b].length,
              )}`,
              "igm",
            ),
          )
        ) {
          unitPbDemo[i] = unitPublish[b];
          break;
        }
      }
    } else {
      unitPbDemo = unitPublish;
    }
  });
  return { unitPbDemo, nameSign };
}

function getLawDayActive(text, daySign) {
  let lawDayActive;
  if (
    text.match(
      /(?<=(LUẬT|BỘ LUẬT|NGHỊ ĐỊNH|Nghị định|THÔNG TƯ|NGHỊ QUYẾT|THÔNG TƯ LIÊN TỊCH|QUYẾT ĐỊNH|PHÁP LỆNH|CHỈ THỊ|BÁO CÁO|HƯỚNG DẪN|HIẾN PHÁP)(\s(này|này))?.{0,19}(có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực)[^;]+)sau \d* ngày/im,
    )
  ) {
    lawDayActive = text.match(
      /(?<=(LUẬT|BỘ LUẬT|NGHỊ ĐỊNH|Nghị định|THÔNG TƯ|NGHỊ QUYẾT|THÔNG TƯ LIÊN TỊCH|QUYẾT ĐỊNH|PHÁP LỆNH|CHỈ THỊ|BÁO CÁO|HƯỚNG DẪN|HIẾN PHÁP)(\s(này|này))?.{0,19}(có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực)[^;]+)sau \d* ngày/im,
    )[0];
    let countDaysAfter = lawDayActive.match(/\d+/gim)[0];
    lawDayActive = addDaysToDate(daySign, parseInt(countDaysAfter));
    // console.log(3);
  } else if (
    text.match(
      // /(?<=^(Điều|Ðiều|Điều) \d.*(Hiệu lực|thi hành|thực hiện).*\n).*(có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực).* từ ngày k/im
      /(LUẬT|BỘ LUẬT|NGHỊ ĐỊNH|Nghị định|THÔNG TƯ|NGHỊ QUYẾT|THÔNG TƯ LIÊN TỊCH|QUYẾT ĐỊNH|PHÁP LỆNH|CHỈ THỊ|BÁO CÁO|HƯỚNG DẪN|HIẾN PHÁP)(\s(này|này))?.{0,19}(có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực).{0,19}từ ngày (k|ban hành)/im,
    )
  ) {
    // console.log(1);

    lawDayActive = addDaysToDate(daySign, 0);
  } else if (
    text.match(
      /(?<=(LUẬT|BỘ LUẬT|NGHỊ ĐỊNH|Nghị định|THÔNG TƯ|NGHỊ QUYẾT|THÔNG TƯ LIÊN TỊCH|QUYẾT ĐỊNH|PHÁP LỆNH|CHỈ THỊ|BÁO CÁO|HƯỚNG DẪN|HIẾN PHÁP|Quy chuẩn kỹ thuật|Định mức)(\s(này|này))?.{0,100}( và )?(có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực)[^\d]{0,19})(ngày|ngày)\s*\d*\s*(tháng|tháng)\s*\d*\s*năm\s*\d*/im,
    )
  ) {
    let lawDayActiveDemo = text.match(
      /(?<=(LUẬT|BỘ LUẬT|NGHỊ ĐỊNH|Nghị định|THÔNG TƯ|NGHỊ QUYẾT|THÔNG TƯ LIÊN TỊCH|QUYẾT ĐỊNH|PHÁP LỆNH|CHỈ THỊ|BÁO CÁO|HƯỚNG DẪN|HIẾN PHÁP|Quy chuẩn kỹ thuật|Định mức)(\s(này|này))?.{0,100}( và )?(có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực)[^\d]{0,19})(ngày|ngày)\s*\d*\s*(tháng|tháng)\s*\d*\s*năm\s*\d*/gim,
    )[
      text.match(
        /(?<=(LUẬT|BỘ LUẬT|NGHỊ ĐỊNH|Nghị định|THÔNG TƯ|NGHỊ QUYẾT|THÔNG TƯ LIÊN TỊCH|QUYẾT ĐỊNH|PHÁP LỆNH|CHỈ THỊ|BÁO CÁO|HƯỚNG DẪN|HIẾN PHÁP|Quy chuẩn kỹ thuật|Định mức)(\s(này|này))?.{0,100}( và )?(có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực)[^\d]{0,19})(ngày|ngày)\s*\d*\s*(tháng|tháng)\s*\d*\s*năm\s*\d*/gim,
      ).length - 1
    ];
    // console.log(2);
    let RemoveDay = lawDayActiveDemo.replace(/(ngày|ngày) */im, "");
    let RemoveMonth = RemoveDay.replace(/ *(tháng|tháng) */im, "/");
    lawDayActive = addDaysToDate(RemoveMonth.replace(/ *năm */im, "/"), 0);
  } else if (
    text.match(
      // /(?<=^(Điều|Ðiều|Điều) \d.*(Hiệu lực|thi hành|thực hiện).*(\n.*)*.*(có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực)[^\d]+)\d+\/\d+\/\d+/im
      /(?<=(LUẬT|BỘ LUẬT|NGHỊ ĐỊNH|Nghị định|THÔNG TƯ|NGHỊ QUYẾT|THÔNG TƯ LIÊN TỊCH|QUYẾT ĐỊNH|PHÁP LỆNH|CHỈ THỊ|BÁO CÁO|HƯỚNG DẪN|HIẾN PHÁP)(\s(này|này))?.{0,19}(có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực)[^\d]{0,19}ngày\s)\d+(\/|\-)\d+(\/|\-)\d+/im,
    )
  ) {
    lawDayActive = text.match(
      /(?<=(LUẬT|BỘ LUẬT|NGHỊ ĐỊNH|Nghị định|THÔNG TƯ|NGHỊ QUYẾT|THÔNG TƯ LIÊN TỊCH|QUYẾT ĐỊNH|PHÁP LỆNH|CHỈ THỊ|BÁO CÁO|HƯỚNG DẪN|HIẾN PHÁP)(\s(này|này))?.{0,19}(có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực|có hiệu lực)[^\d]{0,19}ngày\s)\d+(\/|\-)\d+(\/|\-)\d+/im,
    )[0];
    lawDayActive = lawDayActive.replace(/-/gim, "/");

    lawDayActive = addDaysToDate(lawDayActive, 0);
  } else {
    // console.log(4);
    lawDayActive = null;
  }

  return lawDayActive;
}

async function getLawRelated(text, dayActive, ObjectLawPair, lawNumber) {
  function uniqueArray(orinalArray) {
    let noDuplicate = orinalArray.filter((elem, position, arr) => {
      return arr.indexOf(elem) == position && elem != lawNumber;
    });

    let removeDayMonth = noDuplicate.map((value, index) => {
      return value.replace(/ngày.*tháng.*(?=năm)/gim, "");
    });

    return removeDayMonth;
  }

  text = text.replace(/\s/gim, " ");

  let lawRelatedDemo = text.match(
    /(?<!(mẫu( số)?|ví dụ.*)) \d+\/?\d*\/\D{1,8}\-[^(\s|,|.| |\:|\"|\'|\;|\{|\}|”)]+/gi,
  );
  lawRelatedDemo =
    lawRelatedDemo &&
    text.match(/(?<!(mẫu( số)?|ví dụ.*)) \d+\/?\d*\/QH\d{1,2}/gi)
      ? [
          ...lawRelatedDemo,
          ...text.match(/(?<!(mẫu( số)?|ví dụ.*)) \d+\/?\d*\/QH\d{1,2}/gi),
        ]
      : !lawRelatedDemo
        ? text.match(/(?<!(mẫu( số)?|ví dụ.*)) \d+\/?\d*\/QH\d{1,2}/gi)
        : lawRelatedDemo;

  let lawRelatedDemo2 = lawRelatedDemo
    ? lawRelatedDemo.map(function (item) {
        return item.replace(/ */g, "");
      })
    : [];

  if (
    text.match(
      /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+năm \d+/gi,
    )
  ) {
    for (
      let y = 0;
      y <
      text.match(
        /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+năm \d+/gi,
      ).length;
      y++
    ) {
      if (
        !text
          .match(
            /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+năm \d+/gi,
          )
          [y].match(/(?<=năm \d+) và (?=luật sửa)/gi)
      ) {
        if (
          !text
            .match(
              /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+năm \d+/gi,
            )
            [y].match(/(luật|Luật|bộ luật|pháp lệnh) số \d/gi)
        ) {
          if (
            text
              .match(
                /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+năm \d+/gi,
              )
              [y].match(/(?<=năm \d+) và (?=(NGHỊ ĐỊNH|Nghị định|THÔNG TƯ))/gi)
          ) {
            let lawRelatedString = text
              .match(
                /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+năm \d+(?= và (NGHỊ ĐỊNH|Nghị định|THÔNG TƯ))/gi,
              )
              [y].replace(/ số \d+[^( |,)]+/gim, "");
            lawRelatedString = lawRelatedString.replace(
              / ngày \d+\/\d+\/\d+/gim,
              "",
            );
            lawRelatedString = lawRelatedString.replace(
              / ngày \d+ *\d+ *\d+/gim,
              "",
            );
            lawRelatedString = lawRelatedString.replace(
              / (ngày|ngày) *\d+ *(tháng|tháng) *\d+/gim,
              "",
            );
            lawRelatedDemo2 = [...lawRelatedDemo2, lawRelatedString];
          } else {
            let lawRelatedString = text
              .match(
                /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+năm \d+/gi,
              )
              [y].replace(/ số \d+[^( |,)]+/gim, "");
            lawRelatedString = lawRelatedString.replace(
              / ngày \d+\/\d+\/\d+/gim,
              "",
            );
            lawRelatedString = lawRelatedString.replace(
              / ngày \d+ *\d+ *\d+/gim,
              "",
            );
            lawRelatedString = lawRelatedString.replace(
              / (ngày|ngày) *\d+ *(tháng|tháng) *\d+/gim,
              "",
            );
            lawRelatedDemo2 = [...lawRelatedDemo2, lawRelatedString];
          }
        }
      } else {
        let lawRelatedString = text
          .match(
            /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+năm \d+/gi,
          )
          [y].replace(/ số \d+[^( |,)]+/gim, "");
        lawRelatedString = lawRelatedString.replace(
          / ngày \d+\/\d+\/\d+/gim,
          "",
        );
        lawRelatedString = lawRelatedString.replace(
          / ngày \d+ *\d+ *\d+/gim,
          "",
        );
        lawRelatedString = lawRelatedString.replace(
          / (ngày|ngày) *\d+ *(tháng|tháng) *\d+/gim,
          "",
        );
        lawRelatedDemo2 = [
          ...lawRelatedDemo2,
          ...lawRelatedString.split(/(?<=năm \d+) và (?=luật sửa)/gi),
        ];
      }
    }
  } else if (
    text.match(
      /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+ngày \d+\/+\d+\/\d+/gi,
    )
  ) {
    for (
      let y = 0;
      y <
      text.match(
        /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+ngày \d+\/+\d+\/\d+/gi,
      ).length;
      y++
    ) {
      if (
        !text
          .match(
            /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+ngày \d+\/+\d+\/\d+/gi,
          )
          [y].match(/(?<=ngày \d+\/+\d+\/\d+) và (?=luật sửa)/gi)
      ) {
        let lawRelatedString = text
          .match(
            /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+ngày \d+\/+\d+\/\d+/gi,
          )
          [y].replace(/ số \d+[^( |,)]+/gim, "");
        lawRelatedString = lawRelatedString.replace(
          / ngày \d+\/\d+\/(\d+)/gim,
          " năm $1",
        );

        lawRelatedDemo2 = [...lawRelatedDemo2, lawRelatedString];
      } else {
        let lawRelatedString = text
          .match(
            /(?<=(căn cứ |; ))(luật|Luật|bộ luật|pháp lệnh)[^(;|\n)]+ngày \d+\/+\d+\/\d+/gi,
          )
          [y].replace(/ số \d+[^( |,)]+/gim, "");
        lawRelatedString = lawRelatedString.replace(
          / ngày \d+\/\d+\/(\d+)/gim,
          " năm $1",
        );
        lawRelatedDemo2 = [
          ...lawRelatedDemo2,
          ...lawRelatedString.split(
            /(?<=ngày \d+\/+\d+\/\d+) và (?=luật sửa)/gi,
          ),
        ];
      }
    }
  }

  if (text.match(/(?<=(căn cứ |; |vào ))(hiến pháp)[^(;|\n)]+/gi)) {
    lawRelatedDemo2 = [
      ...lawRelatedDemo2,
      ...text.match(/(?<=(căn cứ |; |vào ))(hiến pháp)[^(;|\n)]+/gi),
    ];
  }
  lawRelatedDemo2 = lawRelatedDemo2.map((item) => {
    return item.replace(/ (ngày|ngày) ?\d+ ?(tháng|tháng) ?\d+/gim, "");
  });

  lawRelatedDemo2 = lawRelatedDemo2.map((item) => {
    return item.replace(/,?\s(?=năm)/gim, " ");
  });

  lawRelatedDemo2 = lawRelatedDemo2.map((item) => {
    return item
      .replace(/\s+/gim, " ")
      .replace(/^\s+/gim, "")
      .replace(/\s+$/gim, "");
  });

  let lawRelated = uniqueArray(lawRelatedDemo2);

  lawRelated = lawRelated.filter(
    (law) => !law.match(/^luật năm/i) && !law.match(/^51\/2001\/QH10/i),
  );

  let lawRelatedObject = {};
  lawRelated = lawRelated.map((law) => {
    return (lawRelatedObject[law] = 0);
  });

  // console.log('lawRelatedObject',lawRelatedObject);

  let lawPairObject = ObjectLawPair;
  for (let a = 0; a < Object.keys(lawRelatedObject).length; a++) {
    if (
      lawPairObject[
        Object.keys(lawRelatedObject)
          [a].toLowerCase()
          .replace(/( và| của|,|&)/gim, "")
      ]
    ) {
      lawRelatedObject[
        lawPairObject[
          Object.keys(lawRelatedObject)
            [a].toLowerCase()
            .replace(/( và| của|,|&)/gim, "")
        ]
      ] = Object.keys(lawRelatedObject)[a];
    } else if (
      lawPairObject[
        Object.keys(lawRelatedObject)[a].replace(/( và| của|,|&)/gim, "")
      ]
    ) {
      lawRelatedObject[Object.keys(lawRelatedObject)[a]] =
        lawPairObject[Object.keys(lawRelatedObject)[a]];
    } else if (Object.keys(lawRelatedObject)[a].match(/Hiến pháp/gim)) {
      // console.log("Object.keys(lawRelatedObject)[a]", Object.keys(lawRelatedObject)[a]);

      const date = new Date(dayActive);

      // console.log("lawRelatedObject", lawRelatedObject);
      if (date > new Date("2025-06-16")) {
        lawRelatedObject["52/VBHN-VPQH(2025)"] =
          Object.keys(lawRelatedObject)[a];
      } else if (date > new Date("2014-01-01")) {
        lawRelatedObject["0001/HP"] = Object.keys(lawRelatedObject)[a];
      } else if (date > new Date("2002-01-07")) {
        lawRelatedObject["0003/HP(2001)"] = Object.keys(lawRelatedObject)[a];
      } else if (date > new Date("1992-04-15")) {
        lawRelatedObject["0002/HP(1992)"] = Object.keys(lawRelatedObject)[a];
      } else {
        lawRelatedObject[Object.keys(lawRelatedObject)[a]] = 0;
      }

      // lawRelatedObject[Object.keys(lawRelatedObject)[a]] = "0002/HP(1992)"
    } else {
      lawRelatedObject[Object.keys(lawRelatedObject)[a]] = 0;
    }
  }
  // console.log("lawRelatedObject", lawRelatedObject);

  const result = Object.fromEntries(
    Object.entries(lawRelatedObject).filter(([key]) => !key.includes(" ")),
  );
  return result;
}

function RemoveNoOrder(array) {
  let prev;
  for (let l = 0; l < array.length; l++) {
    if (l == 0) {
      prev = parseInt(array[l].match(/(?<=(Điều|Điều)\s)\d+/gim)[0]);
    }

    let current = parseInt(array[l].match(/(?<=(Điều|Điều)\s)\d+/gim)[0]);
    if (current == prev || current == prev + 1) {
      prev = parseInt(array[l].match(/(?<=(Điều|Điều)\s)\d+/gim)[0]);
    } else {
      delete array[l];
    }
  }
  let arr = [];
  array.map((key, i) => {
    key ? arr.push(key) : "";
  });
  return arr;
}

function convertPartOne(contentInputText) {
  let b = contentInputText;
  let b1 = b.replace(/^ */gim, ""); // bỏ các space ở đầu mỗi dòng
  let b2 = b1.replace(/\(*đã k(ý|í)\)*/gim, "");
  b2 = b2.replace(/\[daky\]/gim, "");
  let b3 = b2.replace(/^\s*nơi nhận.*\n([^\s].*\n)*/gim, "");
  let b4 = b3.replace(/\n+\s+$/gim, "");
  let b5 = b4.replace(/\n*$/gim, ""); //bỏ xuống dòng ở cuối
  let b6 = b5.replace(/^\s*/gim, ""); // bỏ space, xuống dòng ở đầu
  let b7 = b6.replace(/\s*$/gim, ""); // bỏ space, xuống dòng ở cuối
  let b8 = b7.replace(/(?<=\w)\n\[\d+\].*$(\n.*)*$/gim, ""); // bỏ mấy cái chỉ mục của VBHN đi
  let b9 = b8.replace(/\n+/gim, "\n"); // biến nhiều xuống dòng thành 1 xuống dòng

  let b10 = b9;
  let b11 = b10.replace(/(\[|\()\d*(\]|\))/gim, ""); // bỏ chỉ mục số đi

  let b12 = b11.replace(/(?<=^Chương (V|I|X|\d)*)\.?\s/gim, ": ");
  b12 = b12.replace(/(?<=^Chương.{0,5})l/gim, "I");
  let b13 = b12.replace(/  +/gim, " "); // bỏ khoảng cách 2 space

  return b13;
}

function convertPartTwo(partOne, nameSign) {
  let b14 = "";

  for (let t = 0; t <= 60; t++) {
    let clause;

    clause = partOne.match(`(?<=(\n.*){${t}}).*`, "im")[[0]];
    // console.log(clause);

    if (
      lawKind ? lawKind.match(/nghị quyết/i) : partOne.match(/^nghị quyết/i)
    ) {
      // bỏ phần đầu
      // lawRelatedText = b14.match(/^(.*\n)*QUYẾT NGHỊ(:|\.|\s|)\n/img)[0]
      b14 = partOne.replace(/^(.*\n)*QUYẾT NGHỊ(:|\.|\s|)\n/i, "");
      // console.log("b14a", b14);

      break;
    } else if (clause.match(/^(Phần|PHẦN)\s(THỨ|I|l|1)/gim)) {
      let firstSection = partOne.match(/^(Phần|PHẦN)\s(THỨ|I|l|1).*/im)[0];

      // lawRelatedText = b14.match(new RegExp(`(.*\\n)*(?=${firstSection})\\b`, "img"))[0]
      b14 = partOne.replace(
        new RegExp(`(.*\\n)*(?=${firstSection})\\b`, "img"),
        "",
      );
      // console.log("b14b", b14);

      break;
    } else if (clause.match(/^(Chương|CHƯƠNG)\s(I|l|1)/gim)) {
      let firstChapter = partOne.match(/^(Chương|CHƯƠNG)\s(I|l|1).*/im)[0];
      // console.log(partOne);

      // lawRelatedText = b14.match(new RegExp(`(.*\\n)*(?=${firstChapter})`, "img"))[0]
      b14 = partOne.replace(
        new RegExp(`(.*\\n)*(?=${firstChapter})`, "img"),
        "",
      );
      // console.log("b14c", b14);

      break;
    } else if (clause.match(/^(Điều|Ðiều|Điều)\s(I|l|1)/gim)) {
      let firstArticle = partOne.match(
        /^(Điều|Ðiều|Điều)\s(I|l|1).{0,10}/im,
      )[0]; // lấy 10 ký tự thôi cho chắc
      // console.log('partOne',partOne);
      // console.log('firstArticle',firstArticle);

      // lawRelatedText = partOne.match(new RegExp(`(.*\\n)*(?=${firstArticle})`, "img"))[0]
      b14 = partOne.replace(
        new RegExp(`(.*\\n)*(?=${firstArticle})`, "img"),
        "",
      );
      // console.log("b14d", b14);

      break;
    } else {
      // console.log("not have b14");
    }
  }
  // console.log("partOne", partOne);
  // console.log("b14", b14);

  // console.log("b14.match(/.{1,30}/)[0]", b14.match(/.{1,30}/)[0]);
  let introduceText = partOne.match(
    new RegExp(`(.*\n)*(?=${b14.match(/.{1,30}/)[0]})`, "img"),
  )[0];
  // console.log('a',a);

  let b15 = b14;
  if (b14.match(/(?<=.*\.\/\.)(\n.*)*/gim)) {
    b15 = b14.replace(/(?<=.*\.\/\.)(\n.*)*/gim, ""); //  bỏ tất cả sau ./.
  }

  if (b14.match(/^TM\s?\./m)) {
    b15 = b15.replace(/^TM\s?.*(\n.*)*/m, "");
  } else if (b15.match(/^KT\s?\./m)) {
    b15 = b15.replace(/^KT\s?.*(\n.*)*/m, "");
  } else if (b15.match(new RegExp(nameSign[0]), "img")) {
    for (let k = 0; k < nameSign.length; k++) {
      if (
        b15.match(
          new RegExp(
            `\n.*\n(Thiếu|trung|thượng|đại) ?(Tá|Tướng) ?${nameSign[k]}(\n(.*\n.*)*)*`,
            "img",
          ),
        ) &&
        b15
          .match(
            new RegExp(
              `\n.*\n(Thiếu|trung|thượng|đại) ?(Tá|Tướng) ?${nameSign[k]}(\n(.*\n.*)*)*`,
              "img",
            ),
          )[0]
          .match(/(THỨ|PHÓ)/gim) &&
        !b15
          .match(
            new RegExp(
              `\n.*\n(Thiếu|trung|thượng|đại) ?(Tá|Tướng) ?${nameSign[k]}(\n(.*\n.*)*)*`,
              "img",
            ),
          )[0]
          .match(/(THỨ|PHÓ)/gim).length
      ) {
        b15 = b15.replace(
          new RegExp(
            `\n.*\n(Thiếu|trung|thượng|đại) ?(Tá|Tướng) ?${nameSign[k]}(\n(.*\n.*)*)*`,
            "img",
          ),
          "",
        ); // tất cả hàng cuối
      } else if (
        b15.match(new RegExp(`\n.*\n${nameSign[k]}(\n(.*\n.*)*)*`, "img"))[0]
      ) {
        b15 = b15.replace(
          new RegExp(`\n.*\n${nameSign[k]}(\n(.*\n.*)*)*`, "img"),
          "",
        );
      } else {
        b15 = b15.replace(
          new RegExp(
            `\n.*\n.*\n(Thiếu|trung|thượng|đại) ?(Tá|Tướng) ?${nameSign[k]}(\n(.*\n.*)*)*`,
            "img",
          ),
          "",
        ); // tất cả hàng cuối
      }
    }
  }

  let b16 = b15.replace(/\n$/gim, ""); // bỏ hàng dư trống ở cuối
  let b17 = b16.replace(/\n*VĂN PHÒNG QUỐC HỘI(\n.*)*/gim, ""); // bỏ hàng dư trống ở cuối
  b17 = b17.replace(/\n*XÁC THỰC VĂN BẢN HỢP NHẤT(\n.*)*/gim, "");

  // console.log('lawRT',lawRelatedText);

  return { text: b17, descriptionText: introduceText };
}

function convertPartOneOfficialDispatch(contentInputText) {
  console.log("convertPartOneOfficialDispatch");
  let b = contentInputText;
  let b1 = b.replace(/^ */gim, ""); // bỏ các space ở đầu mỗi dòng
  let b2 = b1.replace(/\(*đã k(ý|í)\)*/gim, "");
  b2 = b2.replace(/\[daky\]/gim, "");
  let b3 = b2.replace(/^\s*nơi nhận.*\n([^\s].*\n)*/gim, "");
  let b4 = b3.replace(/\n+\s+$/gim, "");
  let b5 = b4.replace(/\n*$/gim, ""); //bỏ xuống dòng ở cuối
  let b6 = b5.replace(/^\s*/gim, ""); // bỏ space, xuống dòng ở đầu
  let b7 = b6.replace(/\s*$/gim, ""); // bỏ space, xuống dòng ở cuối
  let b8 = b7.replace(/(?<=\w)\n\[\d+\].*$(\n.*)*$/gim, ""); // bỏ mấy cái chỉ mục của VBHN đi
  let b9 = b8.replace(/\n+/gim, "\n"); // biến nhiều xuống dòng thành 1 xuống dòng

  let b10 = b9;

  let b11 = b10.replace(/\[\d*\]/gim, ""); // bỏ chỉ mục số đi
  // console.log("b12",b4);

  let b12 = b11.replace(/(.*\n)*Kính gửi.*\n/gim, "");
  // b12 = b12.replace(/^(\d+\w?)./gim, "$1.");
  let b13 = b12.replace(/  +/gim, " "); // bỏ khoảng cách 2 space
  // console.log("b13", b13);
  return b13;
}

function convertPartTwoOfficialDispatch(partOne, nameSign) {
  let b14 = partOne;
  let b15 = b14;
  if (b14.match(/(?<=.*\.\/\.)(\n.*)*/gim)) {
    b15 = b14.replace(/(?<=.*\.\/\.)(\n.*)*/gim, ""); //  bỏ tất cả sau ./.
  }
  // console.log(nameSign);

  if (b14.match(/^TM\s?\./m)) {
    b15 = b15.replace(/^TM\s?.*(\n.*)*/m, "");
  } else if (b15.match(/^KT\s?\./m)) {
    b15 = b15.replace(/^KT\s?.*(\n.*)*/m, "");
  } else if (b15.match(/^TL\s?\./m)) {
    b15 = b15.replace(/^TL\s?.*(\n.*)*/m, "");
  } else if (b15.match(new RegExp(nameSign[0]), "img")) {
    for (let k = 0; k < nameSign.length; k++) {
      if (
        b15.match(
          new RegExp(
            `\n.*\n(Thiếu|trung|thượng|đại) ?(Tá|Tướng) ?${nameSign[k]}(\n(.*\n.*)*)*`,
            "img",
          ),
        ) &&
        b15
          .match(
            new RegExp(
              `\n.*\n(Thiếu|trung|thượng|đại) ?(Tá|Tướng) ?${nameSign[k]}(\n(.*\n.*)*)*`,
              "img",
            ),
          )[0]
          .match(/(THỨ|PHÓ)/gim) &&
        !b15
          .match(
            new RegExp(
              `\n.*\n(Thiếu|trung|thượng|đại) ?(Tá|Tướng) ?${nameSign[k]}(\n(.*\n.*)*)*`,
              "img",
            ),
          )[0]
          .match(/(THỨ|PHÓ)/gim).length
      ) {
        b15 = b15.replace(
          new RegExp(
            `\n.*\n(Thiếu|trung|thượng|đại) ?(Tá|Tướng) ?${nameSign[k]}(\n(.*\n.*)*)*`,
            "img",
          ),
          "",
        ); // tất cả hàng cuối
      } else if (
        b15.match(new RegExp(`\n.*\n${nameSign[k]}(\n(.*\n.*)*)*`, "img"))[0]
      ) {
        b15 = b15.replace(
          new RegExp(`\n.*\n${nameSign[k]}(\n(.*\n.*)*)*`, "img"),
          "",
        );
      } else {
        b15 = b15.replace(
          new RegExp(
            `\n.*\n.*\n(Thiếu|trung|thượng|đại) ?(Tá|Tướng) ?${nameSign[k]}(\n(.*\n.*)*)*`,
            "img",
          ),
          "",
        ); // tất cả hàng cuối
      }
    }
  }

  let b16 = b15.replace(/\n$/gim, ""); // bỏ hàng dư trống ở cuối
  let b17 = b16.replace(/\n*VĂN PHÒNG QUỐC HỘI(\n.*)*/gim, ""); // bỏ hàng dư trống ở cuối
  b17 = b17.replace(/\n*XÁC THỰC VĂN BẢN HỢP NHẤT(\n.*)*/gim, "");
  // console.log("b17", b17);

  return b17;
}

async function convertBareTextInfo(
  inputText,
  lawRelatedText,
  lawNumber,
  nameSignArrayDemo,
  lawKind,
  unitPublishAray,
  ObjectLawPair,
  lawDaySign,
  lawNameDisplay,
  lawDescription,
) {
  console.log("`convertBareTextInfo`");

  // nameSign = nameSignArrayDemo;
  let partOne, partTwo;
  if (lawNumber.match(/^\d+\/(TAND|VKS).+\-/gim)) {
    partOne = convertPartOneOfficialDispatch(inputText); ////////////////////////////////////////////////////////////////////////////////////

    partTwo = convertPartTwoOfficialDispatch(partOne, nameSignArrayDemo);

    //   lawDescription = convertPartTwoOfficialDispatch(partOne, nameSignArrayDemo)
    // .descriptionText.match(new RegExp(`(?<=ban hành )(.*)\.$`, "m"))[0]
    // .replace(/\.$/gim, "")
    // .trim();
  } else {
    partOne = convertPartOne(inputText);

    partTwo = convertPartTwo(partOne, nameSignArrayDemo).text;

    lawDescription = convertPartTwo(partOne, nameSignArrayDemo)
      .descriptionText.match(new RegExp(`(?<=ban hành )(.*)\.$`, "m"))[0]
      .replace(/\.$/gim, "")
      .trim();
  }

  roleSign = getRoleSign(partOne, nameSignArrayDemo);

  nameSign = getArrangeUnitPublic(
    partOne,
    nameSignArrayDemo,
    lawKind,
    unitPublishAray,
  )["nameSign"];
  unitPublish = getArrangeUnitPublic(
    partOne,
    nameSignArrayDemo,
    lawKind,
    unitPublishAray,
  )["unitPbDemo"];

  lawDayActive = getLawDayActive(partOne, lawDaySign);

  if (lawRelatedText) {
    lawRelated = await getLawRelated(
      lawRelatedText,
      lawDayActive,
      ObjectLawPair,
      lawNumber,
    );
  } else {
    lawRelated = await getLawRelated(
      partOne,
      lawDayActive,
      ObjectLawPair,
      lawNumber,
    );
  }

  lawDaySign = lawDaySign.includes('/')?addDaysToDate(lawDaySign, 0):new Date(lawDaySign);


  lawDescription = lawKind.match(/Luật/gim)
    ? lawDescription + " số " + lawNumber
    : lawNumber.match(/VBHN/gim)
      ? lawKind +
        " số " +
        lawNumber +
        " năm " +
        lawDaySign.getFullYear() +
        " của " +
        unitPublish[0] +
        " ban hành " +
        lawNameDisplay.replace(/ hợp nhất năm.*/, "")
      : lawNameDisplay +
        " " +
        lawDescription.replace(new RegExp(`^${lawKind} `), "");

  lawInfo["lawDescription"] = lawDescription;
  lawInfo["lawNumber"] = lawNumber;
  lawInfo["unitPublish"] = unitPublish;
  lawInfo["lawKind"] = lawKind;
  lawInfo["lawDaySign"] = lawDaySign;
  lawInfo["lawDayActive"] = lawDayActive;
  lawInfo["lawNameDisplay"] = lawNameDisplay;
  lawInfo["lawRelated"] = lawRelated;
  lawInfo["nameSign"] = nameSign;
  lawInfo["roleSign"] = roleSign;

  return { lawInfo, partTwo };
}

async function getNormalTextInfo(
  contentText,
  roleSignText,
  lawRelatedText,
  lawNumber,
  nameSignArrayDemo,
  ObjectLawPair,
  lawDaySign,
  lawNameDisplay, // lấy từ phần tổng quan trong luatvietnam
  lawDescription, // lawDescription lấy từ phần cuối giới thiệu phần đầu trong luật
  lawKind,
  unitPublishAray,
  lawRelated,
) {
  console.log("getNormalTextInfo");
  // console.log('Đây là lawRelated',lawRelatedText);

  nameSign = getArrangeUnitPublic(
    roleSignText,
    nameSignArrayDemo,
    lawKind,
    unitPublishAray,
  )["nameSign"];
  unitPublish = getArrangeUnitPublic(
    roleSignText,
    nameSignArrayDemo,
    lawKind,
    unitPublishAray,
  )["unitPbDemo"];
  // console.log('unitPublish',unitPublish);

  let contentRoleSign = roleSignText;
  roleSign = getRoleSign(contentRoleSign, nameSignArrayDemo);

  lawDayActive = getLawDayActive(contentText, lawDaySign);

  let introduceString = lawRelatedText;
  lawRelated = await getLawRelated(
    introduceString,
    lawDayActive,
    ObjectLawPair,
    lawNumber,
  );

  lawDaySign = lawDaySign.includes('/')?addDaysToDate(lawDaySign, 0):new Date(lawDaySign);

  // console.log("lawDescription", lawDescription);

  lawDescription = lawRelatedText.match(
    new RegExp(`(?<=ban hành )(.*)\.$`, "m"),
  )
    ? lawRelatedText
        .match(new RegExp(`(?<=ban hành )(.*)\.$`, "m"))[0]
        .replace(/\.$/gim, "")
        .trim()
    : lawDescription;

  // console.log('lawDescription', lawDescription);

  lawDescription = lawKind.match(/Luật/gim)
    ? lawDescription + " số " + lawNumber
    : lawNumber.match(/VBHN/gim)
      ? lawKind +
        " số " +
        lawNumber +
        " năm " +
        lawDaySign.getFullYear() +
        " của " +
        unitPublish[0] +
        " ban hành " +
        lawNameDisplay.replace(/ hợp nhất năm.*/, "")
      : lawNameDisplay +
        " " +
        lawDescription.replace(new RegExp(`^${lawKind} `), "");

  return {
    lawInfo: {
      unitPublish,
      lawDaySign,
      nameSign,
      roleSign,
      lawDayActive,
      lawDescription,
      lawNumber,
      lawRelated,
      lawKind,
      lawNameDisplay,
    },
    partTwo: contentText,
  };
}

function convertContent(contentOutputText) {
  let data = [];

  let input = contentOutputText;

  let i0 = input.replace(
    /^(Điều|Ðiều|Điều)( |\u00A0)+(\d+\w?)\.(.*)/gim,
    "Điều $3:$4",
  );
  // điều . thành điều:

  let i1 = i0.replace(
    /^(Điều|Ðiều|Điều)( |\u00A0)+(\d+\w?)\.(.*)/gim,
    "Điều $3:$4",
  );

  let i2 = i1.replace(/­/gm, "");

  let i3 = i2.replace(/(?<=^Chương (V|I|X|\d)*)\./gim, "");

  let i4;

  let i4a = [];
  let initial = 4; // số dòng tối đa mặc định có thể bị xuống dòng làm cho phần 'chương' không được gộp
  // thành 1 dòng (có thể thay đổi để phù hợp tình hình)

  for (let b = 0; b < initial; b++) {
    if (!b) {
      i4a[b] = i3.replace(/(?<=^Mục .*)\n(?!(Điều|Ðiều|Điều) \d.*)/gim, ": ");
    } else {
      i4a[b] = i4a[b - 1].replace(
        /(?<=^Mục .*)\n(?!(Điều|Ðiều|Điều) \d.*)/gim,
        " ",
      );

      // kết nối "mục với nội dung "mục", trường hợp bị tách 2 hàng
    }
  }

  i4 = i4a[initial - 1];

  let i5 = i4.replace(/^(Mục|Mục)(.*)\n/gim, ""); // bỏ mục đi

  let i6 = i5.replace(/(\[|\()\d*(\]|\))/gim, ""); // bỏ chỉ mục

  let i7 = i6.replace(/\u00A0/gim, " ");

  let i8;
  let i8a = []; // kết nối "Phần thứ với nội dung "phần thứ ...", trường hợp bị tách 2 hàng

  for (let c = 0; c < 5; c++) {
    if (!c) {
      i8a[c] = i7.replace(
        /(?<=^(Phần|PHẦN)\s(THỨ|I|l|1).*)\n(?!(((Điều|Ðiều|Điều) \d.*)|(chương (V|I|X|\d).*$.*)))/gim,
        ": ",
      );
    } else {
      i8a[c] = i8a[c - 1].replace(
        /(?<=^(Phần|PHẦN)\s(THỨ|I|l|1).*)\n(?!(((Điều|Ðiều|Điều) \d.*)|(chương (V|I|X|\d).*$.*)))/gim,
        " ",
      );
    }
  }
  i8 = i8a[4];

  let i9 = i8.replace(/(?<=^(Phần|PHẦN)\s(THỨ|I|l|\d)+[^\.]*)\./im, ""); // bỏ dấu chấm cuối chữ phần thứ ...

  let i10;
  let i10a = []; // kết nối "chương với nội dung "chương ...", trường hợp bị tách 2 hàng

  for (let c = 0; c < initial; c++) {
    if (!c) {
      i10a[c] = i9.replace(
        /(?<=^Chương (V|I|X|\d).*)\n(?!(Điều|Ðiều|Điều) \d.*)/gim,
        ": ",
      );
    } else {
      i10a[c] = i10a[c - 1].replace(
        /(?<=^Chương (V|I|X|\d).*)\n(?!(Điều|Ðiều|Điều) \d.*)/gim,
        " ",
      );
    }
  }

  i10 = i10a[initial - 1];
  i10 = i10.replace(/(?<=^Chương (V|I|X|\d)*) /gim, ": ");

  contentText = i10;
  // setFullText(i10);
  // setContentOutput(i10);

  if (i10.match(/^CHƯƠNG.*/i)) {
    // nếu có chương ...

    let chapterArray; // lấy riêng lẻ từng chương thành 1 array
    if (i10.match(/^Chương (V|I|X|\d).*$/gim)) {
      chapterArray = i10.match(/^Chương (V|I|X|\d).*$/gim);
    } else {
      chapterArray = null;
    }

    let articleArray; // lấy khoảng giữa các chương
    let allArticle = []; // lấy riêng lẻ các điều
    let point = [];
    let d = -1;

    for (var a = 0; a < chapterArray.length; a++) {
      articleArray = [];

      if (a < chapterArray.length - 1) {
        let chapterArrayA = chapterArray[a].replace(/\\/gim, "\\\\");
        chapterArrayA = chapterArrayA.replace(/\(/gim, "\\(");
        chapterArrayA = chapterArrayA.replace(/\)/gim, "\\)");

        let chapterArrayB = chapterArray[a + 1].replace(/\\/gim, "\\\\");
        chapterArrayB = chapterArrayB.replace(/\(/gim, "\\(");
        chapterArrayB = chapterArrayB.replace(/\)/gim, "\\)");

        let replace = `(?<=${chapterArrayA}\n)(.*\n)*(?=${chapterArrayB})`;
        let re = new RegExp(replace, "gim");
        articleArray = i10.match(re);
      } else {
        let chapterArrayA = chapterArray[a].replace(/\(/gim, "\\(");
        chapterArrayA = chapterArrayA.replace(/\)/gim, "\\)");
        chapterArrayA = chapterArrayA.replace(/\\/gim, "\\\\");

        let replace = `((?<=${chapterArrayA}))((\n.*)*)$`;
        let re = new RegExp(replace, "gim");
        articleArray = i10.match(re);
      }

      if (articleArray[0].match(/^(Điều|Điều) \d+(.*)$/gim)) {
        data[a] = { [chapterArray[a]]: [] };
        allArticle.push(articleArray[0].match(/^(Điều|Điều) \d+(.*)$/gim));
      } else {
      }

      // console.log('allArticle[a]',allArticle[a]);

      allArticle[a] = RemoveNoOrder(allArticle[a]);

      let countArticle = allArticle[a].length;

      for (let b = 0; b < countArticle; b++) {
        let TemRexgexArticleA = allArticle[a][b];

        TemRexgexArticleA = allArticle[a][b].replace(/\\/gm, "\\\\");
        TemRexgexArticleA = TemRexgexArticleA.replace(/\(/gim, "\\(");
        TemRexgexArticleA = TemRexgexArticleA.replace(/\)/gim, "\\)");
        TemRexgexArticleA = TemRexgexArticleA.replace(/\./gim, "\\.");

        if (b < countArticle - 1) {
          let TemRexgexArticleB = allArticle[a][b + 1];

          TemRexgexArticleB = allArticle[a][b + 1].replace(/\\/gm, "\\\\");
          TemRexgexArticleB = TemRexgexArticleB.replace(/\(/gim, "\\(");
          TemRexgexArticleB = TemRexgexArticleB.replace(/\)/gim, "\\)");
          TemRexgexArticleB = TemRexgexArticleB.replace(/\./gim, "\\.");

          let replace = `(?<=${TemRexgexArticleA}\n)(.*\n)*(?=${TemRexgexArticleB})`;
          let re = new RegExp(replace, "gim");

          if (articleArray[0].match(re)) {
            let e = articleArray[0].match(re)[0];
            e = articleArray[0].match(re)[0].replace(/\n+$/, "");
            e = e.replace(/^\n+/, "");

            point.push(e);
          } else {
            point.push([""]);
          }
        } else {
          let TemRexgexArticleB = allArticle[a][b];

          TemRexgexArticleB = allArticle[a][b].replace(/\\/gm, "\\\\");
          TemRexgexArticleB = TemRexgexArticleB.replace(/\(/gim, "\\(");
          TemRexgexArticleB = TemRexgexArticleB.replace(/\)/gim, "\\)");
          TemRexgexArticleB = TemRexgexArticleB.replace(/\./gim, "\\.");

          let replace = `(?<=${TemRexgexArticleB}\n)(.*\n)*.*$`;
          let re = new RegExp(replace, "im");

          if (articleArray[0].match(re)) {
            let e = articleArray[0].match(re)[0];
            e = articleArray[0].match(re)[0].replace(/\n+$/, "");
            e = e.replace(/^\n+/, "");

            point.push(e);
          } else {
            point.push([""]);
          }
        }

        for (let c = 0; c < 1; c++) {
          d++;

          data[a][chapterArray[a]][b] = { [allArticle[a][b]]: point[d] };
        }
      }
    }
    // setTextForMachine(data);
  } else if (i10.match(/^(Phần|PHẦN)\s(THỨ|I|l|\d).*/i)) {
    //////////////////////////////////////////////////////////  // nếu có phần thứ ...

    let sectionArray;

    if (i10.match(/^(Phần|PHẦN)\s(THỨ|I|l|\d).*/gim)) {
      sectionArray = i10.match(/^(Phần|PHẦN)\s(THỨ|I|l|\d).*/gim);
    } else {
      sectionArray = null;
    }

    let ContentInEachSection; // lấy khoảng giữa các phần
    data = [];
    let point = [];

    for (var a = 0; a < sectionArray.length; a++) {
      ContentInEachSection = [];
      if (a < sectionArray.length - 1) {
        let replace = `(?<=${sectionArray[a]}\n)(.*\n)*(?=${
          sectionArray[a + 1]
        })`;
        let re = new RegExp(replace, "gim");
        ContentInEachSection = i10.match(re);
      } else {
        let replace = `((?<=${sectionArray[a]}))((\n.*)*)$`;
        let re = new RegExp(replace, "gim");
        ContentInEachSection = i10.match(re);
      }

      let chapterArray = []; // mảng có từng chapter riêng lẻ
      let articleArray = []; // mảng có từng Điều riêng lẻ

      if (ContentInEachSection[0].match(/^Chương.*$/gim)) {
        // nếu mà trong 'phần thứ...' có chương

        chapterArray = ContentInEachSection[0].match(/^Chương.*$/gim);
        data[a] = {};
        data[a][sectionArray[a]] = [];

        let ContentInEachChapter = [];
        for (let b = 0; b < chapterArray.length; b++) {
          if (b < chapterArray.length - 1) {
            let chapterArrayA = chapterArray[b].replace(/\(/gim, "\\(");
            chapterArrayA = chapterArrayA.replace(/\)/gim, "\\)");

            let chapterArrayB = chapterArray[b + 1].replace(/\(/gim, "\\(");
            chapterArrayB = chapterArrayB.replace(/\)/gim, "\\)");

            let replace = `(?<=${chapterArrayA}\n)(.*\n)*(?=${chapterArrayB})`;
            let re = new RegExp(replace, "gim");
            ContentInEachChapter = ContentInEachSection[0].match(re);
          } else {
            let chapterArrayA = chapterArray[b].replace(/\(/gim, "\\(");
            chapterArrayA = chapterArrayA.replace(/\)/gim, "\\)");

            let replace = `((?<=${chapterArrayA}))((\n.*)*)$`;
            let re = new RegExp(replace, "gim");
            ContentInEachChapter = ContentInEachSection[0].match(re);
          }

          articleArray = ContentInEachChapter[0].match(
            /^(Điều|Điều) \d+(.*)$/gim,
          );
          data[a][sectionArray[a]][b] = {};
          data[a][sectionArray[a]][b][chapterArray[b]] = [];

          articleArray = RemoveNoOrder(articleArray);

          for (let c = 0; c < articleArray.length; c++) {
            let TemRexgexArticleA = articleArray[c];

            TemRexgexArticleA = articleArray[c].replace(/\\/gim, "\\\\");
            TemRexgexArticleA = TemRexgexArticleA.replace(/\(/gim, "\\(");
            TemRexgexArticleA = TemRexgexArticleA.replace(/\)/gim, "\\)");
            TemRexgexArticleA = TemRexgexArticleA.replace(/\./gim, "\\.");
            if (c < articleArray.length - 1) {
              let TemRexgexArticleB = articleArray[c + 1];

              TemRexgexArticleB = articleArray[c + 1].replace(/\\/gim, "\\\\");
              TemRexgexArticleB = TemRexgexArticleB.replace(/\(/gim, "\\(");
              TemRexgexArticleB = TemRexgexArticleB.replace(/\)/gim, "\\)");
              TemRexgexArticleB = TemRexgexArticleB.replace(/\./gim, "\\.");
              let replace = `(?<=${TemRexgexArticleA}\n)(.*\n)*(?=${TemRexgexArticleB})`;
              let re = new RegExp(replace, "gim");
              point = ContentInEachChapter[0].match(re);
            } else {
              let TemRexgexArticleB = articleArray[c];

              TemRexgexArticleB = articleArray[c].replace(/\\/gim, "\\\\");
              TemRexgexArticleB = TemRexgexArticleB.replace(/\(/gim, "\\(");
              TemRexgexArticleB = TemRexgexArticleB.replace(/\)/gim, "\\)");
              TemRexgexArticleB = TemRexgexArticleB.replace(/\./gim, "\\.");
              let replace = `((?<=${TemRexgexArticleB}))((\n.*)*)$`;
              let re = new RegExp(replace, "gim");
              point = ContentInEachChapter[0].match(re);
            }
            let e;
            if (point) {
              e = point[0].replace(/\n+$/, "");
              e = e.replace(/^\n+/, "");
            } else {
              e = "";
            }

            data[a][sectionArray[a]][b][chapterArray[b]].push({
              [articleArray[c]]: e,
            });
          }
        }
      } else {
        // nếu mà trong 'phần thứ...' không có chương

        articleArray = ContentInEachSection[0].match(
          /^(Điều|Điều) \d+(.*)$/gim,
        );

        data[a] = {};
        data[a][sectionArray[a]] = [];

        articleArray = RemoveNoOrder(articleArray);
        for (let b = 0; b < articleArray.length; b++) {
          // lỡ mà trong 'Điều ...' có dấu ngoặc ),( thì phải thêm \),\(
          // nếu không vì khi lấy nội dung của khoản sẽ bị lỗi

          let TemRexgexArticleA = articleArray[b];

          TemRexgexArticleA = articleArray[b].replace(/\\/gim, "\\\\");
          TemRexgexArticleA = TemRexgexArticleA.replace(/\(/gim, "\\(");
          TemRexgexArticleA = TemRexgexArticleA.replace(/\)/gim, "\\)");
          TemRexgexArticleA = TemRexgexArticleA.replace(/\./gim, "\\.");
          if (b < articleArray.length - 1) {
            let TemRexgexArticleB = articleArray[b + 1];

            TemRexgexArticleB = articleArray[b + 1].replace(/\\/gim, "\\\\");
            TemRexgexArticleB = TemRexgexArticleB.replace(/\(/gim, "\\(");
            TemRexgexArticleB = TemRexgexArticleB.replace(/\)/gim, "\\)");
            TemRexgexArticleB = TemRexgexArticleB.replace(/\./gim, "\\.");

            let replace = `(?<=${TemRexgexArticleA}\n)(.*\n)*(?=${TemRexgexArticleB})`;
            let re = new RegExp(replace, "gim");
            point = ContentInEachSection[0].match(re);
          } else {
            let TemRexgexArticleB = articleArray[b];
            if (articleArray[b].match(/\(/gim)) {
              TemRexgexArticleB = articleArray[b].replace(/\\/gim, "\\\\");
              TemRexgexArticleB = TemRexgexArticleB.replace(/\(/gim, "\\(");
              TemRexgexArticleB = TemRexgexArticleB.replace(/\)/gim, "\\)");
              TemRexgexArticleB = TemRexgexArticleB.replace(/\./gim, "\\.");
            }

            let replace = `(?<=${TemRexgexArticleB}\n)(.*\n)*.*$`;
            let re = new RegExp(replace, "igm");
            point = ContentInEachSection[0].match(re);
          }

          let e;

          if (point) {
            e = point[0].replace(/\n+$/, "");
            e = e.replace(/^\n+/, "");
          } else {
            e = "";
          }

          data[a][sectionArray[a]][b] = [];

          data[a][sectionArray[a]][b] = { [articleArray[b]]: e };
        }
      }
    }
    // setTextForMachine(data);
  } else if (i10.match(/^(Điều|Điều) */i)) {
    /////////////////////////////////////////  // nếu chỉ có Điều ...
    let point;
    let articleArray = i10.match(/^(Điều|Điều) \d+(.*)$/gim);

    articleArray = RemoveNoOrder(articleArray);

    for (let c = 0; c < articleArray.length; c++) {
      let TemRexgexArticleA = articleArray[c];
      TemRexgexArticleA = articleArray[c].replace(/\\/gim, "\\\\");
      TemRexgexArticleA = TemRexgexArticleA.replace(/\(/gim, "\\(");
      TemRexgexArticleA = TemRexgexArticleA.replace(/\)/gim, "\\)");
      TemRexgexArticleA = TemRexgexArticleA.replace(/\./gim, "\\.");

      if (c < articleArray.length - 1) {
        let TemRexgexArticleB = articleArray[c + 1];

        TemRexgexArticleB = articleArray[c + 1].replace(/\\/gim, "\\\\");
        TemRexgexArticleB = TemRexgexArticleB.replace(/\(/gim, "\\(");
        TemRexgexArticleB = TemRexgexArticleB.replace(/\)/gim, "\\)");
        TemRexgexArticleB = TemRexgexArticleB.replace(/\./gim, "\\.");

        let replace = `(?<=${TemRexgexArticleA}\n)(.*\n)*(?=${TemRexgexArticleB})`;
        let re = new RegExp(replace, "gim");
        point = i10.match(re);
      } else {
        let TemRexgexArticleB = articleArray[c];

        if (articleArray[c].match(/\(/gim)) {
          // mới thêm sau này xem có chạy được không
          TemRexgexArticleB = articleArray[c].replace(/\\/gim, "\\\\");
          TemRexgexArticleB = TemRexgexArticleB.replace(/\(/gim, "\\(");
          TemRexgexArticleB = TemRexgexArticleB.replace(/\)/gim, "\\)");
          TemRexgexArticleB = TemRexgexArticleB.replace(/\./gim, "\\.");
        }

        let replace = `(?<=${TemRexgexArticleB}\n)(.*\n)*.*$`;
        let re = new RegExp(replace, "gim");
        point = i10.match(re);
      }
      let e;
      if (point) {
        e = point[0].replace(/\n+$/, "");
        e = e.replace(/^\n+/, "");
      } else {
        e = "";
      }

      data[c] = { [articleArray[c]]: e };
    }
    // setTextForMachine(data);
  }

  console.table("data", data);
  return { data, fullText: i10 };
}

function convertContentOfficialDispatch(contentOutputText) {
  console.log("convertContentOfficialDispatch");

  let i1 = contentOutputText.replace(
    /^Câu( |\u00A0)+(\d+\w?)\.(.*)/gim,
    "Câu $2:$3",
  );
  let i2 = i1.replace(/­/gm, "");
  let i3 = i2.replace(/\[\d*\]/gim, "");
  let i4 = i3.replace(/\u00A0/gim, " ");
  contentText = i4;

  function stripQuotedBlocks(text) {
    const lines = text.split("\n");
    let insideQuote = false;
    const result = [];
    for (const line of lines) {
      const curlyOpen = (line.match(/[\u201C\u201E]/g) || []).length;
      const curlyClose = (line.match(/[\u201D\u201F]/g) || []).length;
      const straight = (line.match(/"/g) || []).length;
      if (insideQuote) {
        if (curlyClose > 0 || straight % 2 !== 0) insideQuote = false;
        continue;
      }
      const opensByCurly = curlyOpen > curlyClose;
      const opensByStraight = straight % 2 !== 0 && curlyOpen === 0;
      if (opensByCurly) {
        const before = line.slice(0, line.search(/[\u201C\u201E]/)).trimEnd();
        if (before) result.push(before);
        insideQuote = true;
      } else if (opensByStraight) {
        const before = line.slice(0, line.indexOf('"')).trimEnd();
        if (before) result.push(before);
        insideQuote = true;
      } else {
        result.push(line);
      }
    }
    return result.join("\n");
  }

  function findHeadings(strippedText, fullText) {
    const strippedLines = strippedText.split("\n");
    const fullLines = fullText.split("\n");
    const headings = [];
    let currentRomanDepth = null;

    strippedLines.forEach((line) => {
      let num, depth;

      const mCau = line.match(/^(Câu( hỏi)?[\s\u00A0]+\d+\w*)[\.:]/);
      if (mCau) {
        num = mCau[1];
        depth = currentRomanDepth !== null ? currentRomanDepth + 1 : 0;
        // Tìm dòng gốc trong fullText theo prefix 30 ký tự
        const prefix = line.slice(0, 30);
        const fullLine = fullLines.find((fl) => fl.startsWith(prefix)) || line;
        headings.push({ line: fullLine, num, depth });
        return;
      }

      const mDieu = line.match(/^(Điều\s+\d+)[\.:]/);
      if (mDieu) {
        num = mDieu[1];
        depth = 1;
        currentRomanDepth = null;
        const prefix = line.slice(0, 30);
        const fullLine = fullLines.find((fl) => fl.startsWith(prefix)) || line;
        headings.push({ line: fullLine, num, depth });
        return;
      }

      const mRoman = line.match(/^((?:V|I|X)+)\.(.*)/);
      if (mRoman) {
        num = mRoman[1];
        currentRomanDepth = 1;
        depth = currentRomanDepth;
        const prefix = line.slice(0, 30);
        const fullLine = fullLines.find((fl) => fl.startsWith(prefix)) || line;
        headings.push({ line: fullLine, num, depth });
        return;
      }

      const mNum = line.match(/^(\d+(?:\.\d+)*)[\.:]( |$)/);
      if (mNum) {
        num = mNum[1];
        const levels = num.split(".").filter(Boolean).length;
        depth =
          currentRomanDepth !== null ? currentRomanDepth + levels : levels + 1;
        const prefix = line.slice(0, 30);
        const fullLine = fullLines.find((fl) => fl.startsWith(prefix)) || line;
        headings.push({ line: fullLine, num, depth });
      }
    });

    return headings;
  }

  // ─── Build tree từ headings + fullText ───────────────────────────────────
  // Trả về object lồng nhau: key = heading line, value = object con hoặc string
  function buildTree(fullText, strippedText) {
    const headings = findHeadings(strippedText, fullText);
    if (!headings.length) return { " ": fullText };

    const fullLines = fullText.split("\n");

    function findLineIndex(headingLine, startFrom = 0) {
      // Chỉ dùng 30 ký tự đầu để match, tránh lỗi khi dòng bị strip/thay đổi
      const prefix = headingLine.slice(0, 30);
      for (let i = startFrom; i < fullLines.length; i++) {
        if (fullLines[i].startsWith(prefix)) return i;
      }
      return -1;
    }
    // Đệ quy build object cho một nhóm headings cùng depth

    function buildLevel(items, parentDepth) {
      const result = [];

      for (let i = 0; i < items.length; i++) {
        const current = items[i];
        const next = items[i + 1];

        const startIdx = findLineIndex(current.line);
        const endIdx = next
          ? findLineIndex(next.line, startIdx + 1)
          : fullLines.length;

        const contentLines = fullLines.slice(
          startIdx + 1,
          endIdx === -1 ? fullLines.length : endIdx,
        );

        const contentText = contentLines.join("\n").trim();

        const childHeadings = headings.filter((h) => {
          const idx = findLineIndex(h.line, startIdx + 1);

          return (
            idx > startIdx &&
            idx < (endIdx === -1 ? fullLines.length : endIdx) &&
            h.depth === parentDepth + 1 &&
            !isSubNumber(current.num, h.num)
          );
        });

        if (childHeadings.length) {
          result.push({
            [current.line]: buildLevel(childHeadings, parentDepth + 1),
          });
        } else {
          result.push({
            [current.line]: contentText,
          });
        }
      }

      return result;
    }
    // Check xem h.num có phải sub-number của parent không
    // VD: parent="14", child="14.1" → true
    // VD: parent="I", child="1" → false
    function isSubNumber(parentNum, childNum) {
      return childNum.startsWith(parentNum + ".");
    }

    const minDepth = Math.min(...headings.map((h) => h.depth));
    const topHeadings = headings.filter((h) => h.depth === minDepth);

    const firstIdx = findLineIndex(topHeadings[0].line);
    const header = fullLines.slice(0, firstIdx).join("\n").trim();

    // ✅ Convert array → object
    const levelArray = buildLevel(topHeadings, minDepth);
    const tree = Object.assign({}, ...levelArray);

    if (header) {
      return { " ": header, ...tree };
    }
    return tree;
  }

  // ─── parseByMinDepthHeadings giờ dùng buildTree ──────────────────────────
  function parseByMinDepthHeadings(fullText, strippedText) {
    const tree = buildTree(fullText, strippedText);
    return Object.entries(tree).map(([key, value]) => ({ [key]: value }));
  }

  let data = [];
  const stripped = stripQuotedBlocks(i4);

  if (i4.match(/(như sau|sau đây|lưu ý):\n(V|I|X)\./gm)) {
    console.log("nếu có chương ...");
    const chapterArray = i4.match(/^(V|I|X)+\..*/gm);
    if (!chapterArray) {
      data = parseByMinDepthHeadings(i4, stripped);
    } else {
      const firstChapterIdx = i4.indexOf(chapterArray[0]);
      const header = i4.slice(0, firstChapterIdx).trim();
      if (header) data.push({ " ": header });
      for (let a = 0; a < chapterArray.length; a++) {
        const chStart = i4.indexOf(chapterArray[a]);
        const chEnd =
          a < chapterArray.length - 1
            ? i4.indexOf(chapterArray[a + 1])
            : i4.length;
        const chContent = i4
          .slice(chStart + chapterArray[a].length, chEnd)
          .trim();
        const chStripped = stripQuotedBlocks(chContent);
        // ← Giờ trả về object lồng nhau thay vì array flat
        const chTree = buildTree(chContent, chStripped);
        data.push({ [chapterArray[a]]: chTree });
      }
    }
  } else if (i4.match(/(như sau|sau đây|lưu ý):\n(A|B|C|D|E|F|G|H)\./gm)) {
    console.log("nếu có phần thứ ...");
    const sectionArray = i4.match(/^(A|B|C|D|E|F|G|H)\..*/gm);
    if (!sectionArray) {
      data = parseByMinDepthHeadings(i4, stripped);
    } else {
      const firstSectionIdx = i4.indexOf(sectionArray[0]);
      const header = i4.slice(0, firstSectionIdx).trim();
      if (header) data.push({ " ": header });
      for (let a = 0; a < sectionArray.length; a++) {
        const secStart = i4.indexOf(sectionArray[a]);
        const secEnd =
          a < sectionArray.length - 1
            ? i4.indexOf(sectionArray[a + 1])
            : i4.length;
        const secContent = i4
          .slice(secStart + sectionArray[a].length, secEnd)
          .trim();
        const secStripped = stripQuotedBlocks(secContent);
        const secTree = buildTree(secContent, secStripped); // object thuần
        data.push({
          [sectionArray[a]]: Object.entries(secTree).map(([k, v]) => ({
            [k]: v,
          })),
        });
      }
    }
  } else {
    console.log("parse trực tiếp theo heading số ...");
    data = parseByMinDepthHeadings(i4, stripped);
  }

  console.table("data", data);
  return { data, fullText: i4 };
}

// ============================================================
// lawProcessor.js  — server-only
// Import file này CHỈ trong: API routes, Server Components, server actions
// KHÔNG BAO GIỜ import trong Client Components ("use client")
// ============================================================

// ─── Helpers ──────────────────────────────────────────────────────────────────
const REGEX = {
  article: /^Điều\s+\d+[a-zA-ZđĐ]*([:.]|$)/i,
};

function cleanText(text = "") {
  if (text == null) return "";
  if (typeof text !== "string") {
    try {
      text = JSON.stringify(text);
    } catch {
      text = String(text);
    }
  }
  return text
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIntoTextChunks(text, maxChars = 5000) {
  if (text.length <= maxChars) return null;
  const chunks = [];
  let current = "";
  const sentences = text.split(/(?<=[.।\n])\s*/);
  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += " " + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 1 ? chunks : null;
}

function createNameLawForPush(lawInfo) {
  const yearSign = new Date(lawInfo["lawDaySign"]).getYear() + 1900;
  return (
    lawInfo["lawNumber"] +
    (!lawInfo["lawNumber"].match(/(?<=\d\W)\d{4}/gim)
      ? "(" + yearSign + ")"
      : "")
  );
}

// ─── Chunk builders ───────────────────────────────────────────────────────────
function createChunks({ law, article, content }) {
  const fullText = [law?.info?.lawDescription, article, content]
    .filter(Boolean)
    .join("\n");
  const parts = splitIntoTextChunks(fullText);
  const base = {
    lawId: createNameLawForPush(law?.info) || "",
    lawdateSign: law?.info?.lawDaySign || "",
    lawDayActive: law?.info?.lawDayActive || "",
    lawDescription: law?.info?.lawDescription || "",
    article,
    fullText,
    embedding: null,
  };
  if (!parts) {
    return [{ ...base, _id: crypto.randomUUID(), textChunk: null }];
  }
  return parts.map((part) => ({
    ...base,
    _id: crypto.randomUUID(),
    textChunk: part,
  }));
}

function parseArticle({ law, articleTitle, articleContent }) {
  return createChunks({
    law,
    article: articleTitle,
    content: cleanText(articleContent),
  });
}

function walkNode({ node, law, chunks }) {
  if (node == null) return;
  if (typeof node === "string") {
    const value = cleanText(node);
    if (!value) return;
    chunks.push(...createChunks({ law, article: "", content: value }));
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) walkNode({ node: item, law, chunks });
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const title = cleanText(key);
      if (REGEX.article.test(title) && typeof value === "string") {
        chunks.push(
          ...parseArticle({ law, articleTitle: title, articleContent: value }),
        );
        continue;
      }
      if (typeof value === "string") {
        chunks.push(
          ...createChunks({ law, article: title, content: cleanText(value) }),
        );
        continue;
      }
      walkNode({ node: value, law, chunks });
    }
  }
}

function extractChunksFromLaw(law) {
  const chunks = [];
  walkNode({ node: law.content, law, chunks });
  return chunks;
}

// ─── Embed ────────────────────────────────────────────────────────────────────
// URL + model đọc từ env (functions/.env). MẶC ĐỊNH = link remote thật.
// Tự nhận định dạng theo endpoint:
//   - .../api/embed      -> body { input },  trả { embeddings: [[...]] }  (remote)
//   - .../api/embeddings -> body { prompt }, trả { embedding: [...] }     (Ollama local kiểu cũ)
const OLLAMA_EMBED_URL =
  process.env.OLLAMA_EMBED_URL || "https://ollama.pixelplaces.net/api/embed";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "bge-m3";

async function embedText(text) {
  const isLegacy = /\/api\/embeddings\/?$/.test(OLLAMA_EMBED_URL);
  const res = await fetch(OLLAMA_EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      isLegacy ? { model: OLLAMA_MODEL, prompt: text } : { model: OLLAMA_MODEL, input: text },
    ),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  const v = isLegacy ? data.embedding : data.embeddings && data.embeddings[0];
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error("Embedding rỗng/không hợp lệ từ " + OLLAMA_EMBED_URL);
  }
  return v;
}

// ─── processAllLaws — trả về mảng chunks đã embed, không ghi DB ───────────────
let isRunning = false;

async function processAllLaws(law) {
  if (isRunning) {
    console.warn("⚠️ processAllLaws đang chạy rồi, bỏ qua request này");
    return [];
  }
  isRunning = true;

  const result = [];

  try {
    let allChunks;

    try {
      allChunks = extractChunksFromLaw(law);
    } catch (err) {
      console.error(`❌ lỗi `, err);
    }

    // console.log('allChunks',allChunks);

    for (let i = 0; i < allChunks.length; i++) {
      const obj = allChunks[i];
      if (!obj?.fullText) continue;

      const textToEmbed = obj.textChunk ?? obj.fullText;

      try {
        obj.embedding = await embedText(textToEmbed);
        console.log(
          `${i + 1}/${allChunks.length} chunk embedding:`,
          obj.embedding[1],
        );
      } catch (err) {
        console.error(`❌ Embed lỗi `, err);
        continue;
      }
      // console.log(`  obj`,obj);
      result.push(obj);
      // console.log(`  ✅ chunk [${i}/${allChunks.length - 1}]`);
    }

    // console.log(`🎉 Hoàn tất `,result);
    return result;
  } finally {
    isRunning = false;
  }
} // isRunning reset về false trong finally để lần sau gọi lại được bình thường sau khi xử lý xong.
// =========================
// createChunkEmbedding — giữ lại nếu cần dùng đơn lẻ
// =========================


async function compareLaw(lawID1, lawID2) {
  let missingLaw1 = [];
  let missingLaw2 = [];

  missingLaw1 = lawID2.filter((item) => !lawID1.includes(item));
  missingLaw2 = lawID1.filter((item) => !lawID2.includes(item));

  let missingLaw = [...missingLaw1, ...missingLaw2];

  console.log(missingLaw);
}

// ─── Exports (CommonJS cho Firebase Functions) ─────────────────────────────────
module.exports = {
  addDaysToDate,
  getRoleSign,
  getArrangeUnitPublic,
  getLawDayActive,
  getLawRelated,
  RemoveNoOrder,
  convertPartOne,
  convertPartTwo,
  convertPartOneOfficialDispatch,
  convertPartTwoOfficialDispatch,
  convertBareTextInfo,
  getNormalTextInfo,
  convertContent,
  convertContentOfficialDispatch,
  extractChunksFromLaw,
  processAllLaws,
  compareLaw,
  createNameLawForPush,
  embedText,
};
