import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Renderer mô phỏng lawMachine/screens/Detail5.js — bản CƠ BẢN:
// hiển thị content (chương/phần/điều/khoản), thu gọn/mở, modal thông tin.
// Đã bỏ: tìm kiếm, mục lục, chọn khoản để copy, ghi nhớ (bookmark).

let TopUnitCount; // đơn vị lớn nhất: 'phần thứ' hoặc 'chương'
let sumChapterArray = []; // mỗi phần tử 'phần thứ...' có tổng bao nhiêu chương
sumChapterArray[0] = 0;
let sumChapterPrevious;
let eachSectionWithChapter = [];

export default function Detail5View({ content, info, onBack, onReload, onPush, pushing, pushed, exists, onDone }) {
  // Chuẩn hoá data về đúng dạng Content/Info như bản gốc.
  const Content = Array.isArray(content) ? content : Object.values(content || {});
  const Info = info || {};

  const [tittleArray, setTittleArray] = useState([]); // section cao nhất (phần thứ / chương)
  const [tittleArray2, setTittleArray2] = useState([]); // chương khi có 'phần thứ...'
  const [modalStatus, setModalStatus] = useState(false);

  const insets = useSafeAreaInsets();
  const list = useRef(null);

  const { width } = Dimensions.get("window");
  const [widthDevice, setWidthDevice] = useState(width);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => setWidthDevice(window.width));
    return () => sub && sub.remove();
  }, []);

  useEffect(() => {
    return () => {
      eachSectionWithChapter = [];
    };
  }, []);

  function collapse(a) {
    if (a == undefined) {
    } else if (tittleArray.includes(a)) {
      setTittleArray(tittleArray.filter((a1) => a1 !== a));
    } else {
      setTittleArray([...tittleArray, a]);
    }

    let contain = false;
    if (eachSectionWithChapter[a]) {
      for (let m = 0; m < eachSectionWithChapter[a].length; m++) {
        if (tittleArray2.includes(eachSectionWithChapter[a][m])) {
          contain = true;
        } else {
          contain = false;
          break;
        }
      }
      let tittleArray2Copy = tittleArray2;
      for (let m = 0; m < eachSectionWithChapter[a].length; m++) {
        if (!contain) {
          if (!tittleArray2.includes(eachSectionWithChapter[a][m])) {
            tittleArray2.push(eachSectionWithChapter[a][m]);
          }
        } else {
          tittleArray2Copy = tittleArray2Copy.filter((item) => item != eachSectionWithChapter[a][m]);
          setTittleArray2(tittleArray2Copy);
        }
      }
    }
  }

  function collapse2(a) {
    if (a == undefined) {
    } else if (tittleArray2.includes(a)) {
      setTittleArray2(tittleArray2.filter((a1) => a1 !== a));
    } else {
      setTittleArray2([...tittleArray2, a]);
    }
  }

  TopUnitCount = Content && Content.length;

  function Shrink() {
    for (let b = 0; b <= TopUnitCount - 1; b++) {
      if (tittleArray == []) {
        setTittleArray([b]);
      } else {
        setTittleArray((oldArray) => [...oldArray, b]);
      }
    }

    let sumChapter = sumChapterArray.reduce((total, currentValue) => {
      if (currentValue) return total + currentValue;
      return total;
    });

    for (let b = 0; b <= sumChapter - 1; b++) {
      if (tittleArray2 == []) {
        setTittleArray2([b]);
      } else {
        setTittleArray2((oldArray) => [...oldArray, b + 1]);
      }
    }
  }

  // đưa nội dung điều (chuỗi / số / mảng / object) về chuỗi — ĐỆ QUY để không bao
  // giờ lòi ra "[object Object]" (mảng chứa object -> raw.join sẽ ra [object Object]).
  function toPlainText(raw) {
    if (raw === undefined || raw === null) return "";
    if (typeof raw === "string") return raw;
    if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
    if (Array.isArray(raw)) {
      return raw.map(toPlainText).filter(Boolean).join("\n");
    }
    if (typeof raw === "object") {
      // object dạng {tiêu đề: nội dung} hoặc {"1.": "...", "2.": "..."}: ghép key + value.
      return Object.entries(raw)
        .map(([k, v]) => {
          const val = toPlainText(v);
          return val ? `${k} ${val}` : String(k);
        })
        .filter(Boolean)
        .join("\n");
    }
    return String(raw);
  }

  // tách nội dung điều thành từng khoản theo dòng bắt đầu bằng "số."
  function splitClauses(text) {
    if (typeof text !== "string" || !text.trim()) return null;
    const lines = text.split("\n");
    const clauses = [];
    let cur = null;
    for (const line of lines) {
      if (/^\s*\d+\.(\s|$)/.test(line)) {
        if (cur !== null) clauses.push(cur);
        cur = line;
      } else {
        cur = cur === null ? line : cur + "\n" + line;
      }
    }
    if (cur !== null) clauses.push(cur);
    return clauses.length > 1 ? clauses : null;
  }

  function getClauses(rawContent) {
    const text = toPlainText(rawContent);
    return splitClauses(text) || [text];
  }

  function renderClauses(clauses) {
    return clauses.map((clause, idx) => (
      <Text key={`kh${idx}`} style={styles.lines}>
        {clause}
      </Text>
    ));
  }

  const a = (key, i, key1, i1a, t) => {
    onlyArticle = false;
    return Object.keys(key)[0] != "0" ? (
      <View style={(t == undefined ? tittleArray.includes(i) : tittleArray2.includes(t)) && styles.content}>
        {key[key1].map((key2, i2) => {
          const title = Object.keys(key2)[0];
          const clauses = getClauses(Object.values(key2)[0]);
          return (
            <View key={`${i2}a1`} style={{ paddingVertical: 4 }}>
              {title === " " ? null : (
                <Text selectable={true} style={styles.dieu}>
                  {title}
                </Text>
              )}
              {renderClauses(clauses)}
            </View>
          );
        })}
      </View>
    ) : (
      <View key={`${i}a3`} />
    );
  };

  const b = (keyA, i, keyB) => {
    onlyArticle = false;
    return (
      <View>
        {keyA[keyB].map((keyC, iC) => {
          let chapterOrdinal = 0;
          if (Object.keys(keyC)[0].match(/(^Chương.*$|^(V|I|X)*\.)/gim)) {
            sumChapterArray[i + 1] = keyA[keyB].length ? keyA[keyB].length : 0;
            sumChapterPrevious = sumChapterArray.slice(0, i + 1).reduce((total, currentValue) => {
              if (currentValue) return total + currentValue;
              return total;
            });
            chapterOrdinal = sumChapterPrevious + iC + 1;
            if (!eachSectionWithChapter[i]) {
              eachSectionWithChapter[i] = [chapterOrdinal];
            } else if (!eachSectionWithChapter[i].includes(chapterOrdinal)) {
              eachSectionWithChapter[i].push(chapterOrdinal);
            }
            return (
              <React.Fragment key={`${iC}b1`}>
                <TouchableOpacity onPress={() => collapse2(chapterOrdinal)}>
                  <Text
                    selectable={true}
                    style={{
                      fontSize: 14,
                      color: "white",
                      fontWeight: "bold",
                      padding: 4,
                      textAlign: "center",
                      backgroundColor: "#66CCFF",
                      marginBottom: 1,
                    }}
                  >
                    {Object.keys(keyC)[0].toUpperCase()}
                  </Text>
                </TouchableOpacity>
                {a(keyC, i, Object.keys(keyC)[0], iC, chapterOrdinal)}
              </React.Fragment>
            );
          } else {
            return (
              <View key={`${iC}b2`} style={tittleArray.includes(i) && styles.content}>
                <View style={{ paddingVertical: 4 }}>
                  <Text selectable={true} style={styles.dieu}>
                    {Object.keys(keyC)[0]}
                  </Text>
                  {renderClauses(getClauses(Object.values(keyC)[0]))}
                </View>
              </View>
            );
          }
        })}
      </View>
    );
  };

  let onlyArticle = true;
  const c = (key, i, ObjKeys) => {
    return Object.keys(key)[0] != "0" ? (
      <View key={`${i}c`}>
        <View style={{ paddingVertical: 4 }}>
          <Text selectable={true} style={styles.dieu}>
            {ObjKeys}
          </Text>
          {renderClauses(getClauses(key[ObjKeys]))}
        </View>
      </View>
    ) : (
      <View key={`${i}c1`} />
    );
  };

  const isFullyCollapsed = TopUnitCount > 0 && tittleArray.length >= TopUnitCount;

  const infoDate = (d) => {
    try {
      return new Date(d).toLocaleDateString("vi-VN");
    } catch {
      return String(d);
    }
  };

  return (
    <View style={{ flex: 1, position: "relative", backgroundColor: "white" }}>
      <View style={{ flex: 1, position: "relative", backgroundColor: "white" }}>
        <View
          style={{
            top: 0,
            backgroundColor: "green",
            // height: insets.top,
            position: "absolute",
            width: widthDevice,
            zIndex: 101,
          }}
        />
        <View
          style={{
            display: "flex",
            flexDirection: "row",
            // top: insets.top,
            width: widthDevice,
            backgroundColor: "green",
            position: "relative",
            height: 50,
            justifyContent: "space-between",
            alignItems: "center",
            paddingRight: 17,
            paddingLeft: 17,
            opacity: 1,
            zIndex: 100,
          }}
        >
          <TouchableOpacity onPressIn={onBack}>
            <Text style={{...styles.IconInfo,fontSize:35}}>‹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              backgroundColor: pushed ? "#C62828" : exists ? "#C62828" : "#009933",
              height: 36,
              paddingHorizontal: 16,
              minWidth: 90,
              flexDirection: "row",
              gap: 8,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 30,
              opacity: pushing ? 0.7 : 1,
            }}
            disabled={pushing}
            onPress={pushed ? onDone : onPush}
          >
            {pushing && <ActivityIndicator size="small" color="white" />}
            <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>
              {pushed ? "✓ Thành công" : pushing ? "Đang push..." : exists ? "Push (ghi đè)" : "Push"}
            </Text>
          </TouchableOpacity>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <TouchableOpacity onPressIn={() => setModalStatus(true)}>
              <Text style={styles.IconInfo}>ⓘ</Text>
            </TouchableOpacity>
          </View>
        </View>

        {exists && (
          <View
            style={{
              backgroundColor: "#FFF3CD",
              paddingHorizontal: 12,
              paddingVertical: 6,
              marginTop: insets.top,
              zIndex: 99,
            }}
          >
            <Text style={{ color: "#8A6D00", fontSize: 13 }}>
              ⚠ Văn bản này ĐÃ CÓ trong CSDL — Push sẽ hỏi ghi đè.
            </Text>
          </View>
        )}

        {Boolean(Content.length) ? (
          <View
            style={{
              flex: 1,
              // marginTop: exists ? 0 : insets.top,
              // marginBottom: (Platform.OS === "ios" ? 15 : 35) + insets.bottom,
            }}
          >
            <ScrollView ref={list} showsVerticalScrollIndicator={true}>
              <Text key={"abc"} style={styles.titleText}>
                {Info && Info["lawNameDisplay"]}
              </Text>
              {Content &&
                Content.map((key, i) => {
                  return (
                    <View key={`${i}Main`}>
                      {(Object.keys(key)[0].match(/^(phần\s+(thứ|[ivx]|\d).*)|^chương .*/gim) ||
                        Object.keys(key)[0].match(
                          /^(V|I|X|A|B|C|D|E|F|G|H|I|J|K|L|M|N|O|P|Q|R|S|T|U|V|W|X|Y|Z)*\./,
                        )) && (
                        <TouchableOpacity style={styles.chapter} onPress={() => collapse(i)}>
                          <Text
                            style={{
                              fontSize: 18,
                              color: "black",
                              fontWeight: "bold",
                              padding: 9,
                              textAlign: "center",
                            }}
                          >
                            {Object.keys(key)[0].toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {Object.keys(key)[0].match(/^phần\s+(thứ|[ivx]|\d).*/gim) ||
                      Object.keys(key)[0].match(/^(A|B|C|D|E|F|G|H)\./)
                        ? b(key, i, Object.keys(key)[0])
                        : Object.keys(key)[0].match(/(^chương .*|^(V|I|X)*\.)/gim)
                        ? a(key, i, Object.keys(key)[0])
                        : c(key, i, Object.keys(key)[0])}
                    </View>
                  );
                })}
              <View style={{ height: 40 + insets.bottom / 2 }} />
            </ScrollView>
          </View>
        ) : (
          <Text style={styles.empty}>content rỗng — parsing có thể sai format!</Text>
        )}

        <View
          style={{
            ...styles.functionTab,
            paddingBottom: Platform.OS === "ios" ? insets.bottom / 2 : 3 + insets.bottom,
            height: Platform.OS === "ios" ? 15 + insets.bottom : 35 + insets.bottom,
            bottom: 0,
          }}
        >
          {!onlyArticle && (
            <TouchableOpacity
              style={styles.tab}
              onPress={() => {
                if (isFullyCollapsed) {
                  setTittleArray([]);
                  setTittleArray2([]);
                } else {
                  setTittleArray([]);
                  Shrink();
                }
              }}
            >
              <Text style={styles.innerTab}>{isFullyCollapsed ? "⊕" : "⊖"}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.tab}
            onPress={() => {
              if (list.current) list.current.scrollTo({ y: 0 });
            }}
          >
            <Text style={styles.innerTab}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => {
              if (list.current) list.current.scrollToEnd({ animated: true });
            }}
          >
            <Text style={styles.innerTab}>↓</Text>
          </TouchableOpacity>
        </View>

        <Modal
          presentationStyle="pageSheet"
          animationType="slide"
          visible={modalStatus}
          onRequestClose={() => setModalStatus(false)}
        >
          <ScrollView style={{ backgroundColor: "#EEEFE4", paddingTop: Platform.OS === "ios" ? 0 : insets.top }}>
            <View style={{ paddingBottom: 70 }}>
              <View
                style={{
                  backgroundColor: "white",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  height: 60,
                  borderColor: "#2F4F4F",
                }}
              >
                <TouchableOpacity
                  onPress={() => setModalStatus(false)}
                  style={{ alignItems: "center", justifyContent: "center", height: 60, width: 60 }}
                >
                  <Text style={{ color: "black", fontSize: 20, textAlign: "center", fontWeight: "bold" }}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={{ padding: 20, paddingTop: 30, paddingBottom: 20 }}>
                <Text style={{ textAlign: "center", fontSize: 23, fontWeight: "bold", color: "black" }}>
                  THÔNG TIN CHI TIẾT
                </Text>
              </View>

              <View
                style={{
                  display: "flex",
                  flexDirection: "column",
                  paddingTop: 10,
                  justifyContent: "space-evenly",
                  alignItems: "center",
                  paddingLeft: "5%",
                  paddingRight: "5%",
                }}
              >
                <View style={{ ...styles.ModalInfoContainer, borderTopWidth: 2 }}>
                  <View style={{ width: "40%", justifyContent: "center" }}>
                    <Text style={styles.ModalInfoTitle}>Tên gọi:</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...styles.ModalInfoContent }}>{Info && Info["lawNameDisplay"]}</Text>
                  </View>
                </View>

                <View style={styles.ModalInfoContainer}>
                  <View style={{ width: "40%", justifyContent: "center" }}>
                    <Text style={styles.ModalInfoTitle}>Trích yếu nội dung:</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...styles.ModalInfoContent, textAlign: "justify" }}>
                      {Info && Info["lawDescription"]}
                    </Text>
                  </View>
                </View>

                <View style={styles.ModalInfoContainer}>
                  <View style={{ width: "40%" }}>
                    <Text style={styles.ModalInfoTitle}>Ngày ký:</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ModalInfoContent}>
                      {Info && Info["lawDaySign"] ? infoDate(Info["lawDaySign"]) : ""}
                    </Text>
                  </View>
                </View>

                {Info["lawDayActive"] && (
                  <View style={styles.ModalInfoContainer}>
                    <View style={{ width: "40%" }}>
                      <Text style={styles.ModalInfoTitle}>Ngày có hiệu lực:</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ModalInfoContent}>{infoDate(Info["lawDayActive"])}</Text>
                    </View>
                  </View>
                )}

                {Info["lawNumber"] && (
                  <View style={styles.ModalInfoContainer}>
                    <View style={{ width: "40%" }}>
                      <Text style={styles.ModalInfoTitle}>Số văn bản:</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ModalInfoContent}>
                        {Info && !Info["lawNumber"].match(/^0001\\HP/gim) ? Info["lawNumber"] : ""}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.ModalInfoContainer}>
                  <View style={{ width: "40%" }}>
                    <Text style={styles.ModalInfoTitle}>Tên người ký:</Text>
                  </View>
                  <View style={{ flex: 1, paddingBottom: 10, paddingTop: 10 }}>
                    {Info && !Array.isArray(Info["nameSign"]) ? (
                      <Text style={styles.ModalInfoContent}>{Info["nameSign"]}</Text>
                    ) : (
                      Info["nameSign"] &&
                      Info["nameSign"].map((key, i) => (
                        <View key={`${i}nameSign`}>
                          <Text style={{ ...styles.ModalInfoContentLawRelated }}>{`- ${key}`}</Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>

                <View style={styles.ModalInfoContainer}>
                  <View style={{ width: "40%" }}>
                    <Text style={styles.ModalInfoTitle}>Chức vụ người ký:</Text>
                  </View>
                  <View style={{ flex: 1, paddingBottom: 10, paddingTop: 10 }}>
                    {Info && !Array.isArray(Info["roleSign"]) ? (
                      <Text style={styles.ModalInfoContent}>{Info["roleSign"]}</Text>
                    ) : (
                      Info["roleSign"] &&
                      Info["roleSign"].map((key, i) => (
                        <View key={`${i}roleSign`}>
                          <Text style={{ ...styles.ModalInfoContentLawRelated }}>{`- ${key}`}</Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>

                <View style={{ ...styles.ModalInfoContainer }}>
                  <View style={{ width: "40%" }}>
                    <Text style={{ ...styles.ModalInfoTitle }}>Cơ quan ban hành:</Text>
                  </View>
                  <View style={{ flex: 1, paddingBottom: 10, paddingTop: 10 }}>
                    {Info && !Array.isArray(Info["unitPublish"]) ? (
                      <Text style={styles.ModalInfoContent}>{Info["unitPublish"]}</Text>
                    ) : (
                      Info["unitPublish"] &&
                      Info["unitPublish"].map((key, i) => (
                        <View key={`${i}unitPublish`}>
                          <Text style={{ ...styles.ModalInfoContentLawRelated }}>{`- ${key}`}</Text>
                        </View>
                      ))
                    )}
                  </View>
                </View>

                {Info && Object.keys(Info).includes("lawRelated") && (
                  <View style={{ ...styles.ModalInfoContainer, borderBottomWidth: 2, flexDirection: "column" }}>
                    <View style={{ width: "100%" }}>
                      <Text style={{ ...styles.ModalInfoTitle, textAlign: "center", paddingBottom: 0 }}>
                        Văn bản liên quan:
                      </Text>
                    </View>
                    <View
                      style={{
                        paddingBottom: 10,
                        paddingTop: 10,
                        flexDirection: "column",
                        width: "100%",
                        paddingRight: 10,
                        paddingLeft: 10,
                      }}
                    >
                      {Info &&
                        Object.entries(Info["lawRelated"])
                          // value = 0 (chưa map số hiệu) hiển thị đầu tiên — chỉ đổi
                          // thứ tự hiển thị, không ảnh hưởng dữ liệu gốc lawRelated.
                          .sort((a, b) => {
                            const az = a[1] === 0 || a[1] === "0" ? 0 : 1;
                            const bz = b[1] === 0 || b[1] === "0" ? 0 : 1;
                            return az - bz;
                          })
                          .map(([key, nameLaw], i) => {
                            const isZero = nameLaw === 0 || nameLaw === "0";
                            return (
                              <View key={`${i}lawRelated`}>
                                <Text
                                  style={{
                                    ...styles.ModalInfoContentLawRelated,
                                    textAlign: "justify",
                                    fontWeight: isZero ? "400" : "600",
                                    fontStyle: "italic",
                                    lineHeight: 22,
                                    paddingLeft: 0,
                                    textTransform: "none",
                                  }}
                                >
                                  {isZero
                                    ? `- ${key}`
                                    : `- ${key}: ${String(nameLaw)}`}
                                </Text>
                              </View>
                            );
                          })}
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => setModalStatus(false)}
                  style={{
                    padding: 5,
                    marginTop: 30,
                    backgroundColor: "white",
                    width: 100,
                    height: 35,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 10,
                    shadowColor: "gray",
                    shadowOpacity: 1,
                    shadowOffset: { width: 1, height: 1 },
                    shadowRadius: 4,
                    elevation: 2,
                  }}
                >
                  <Text style={{ fontSize: 15, color: "black", fontWeight: "bold" }}>Đóng</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleText: {
    fontSize: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 5,
    textAlign: "center",
    paddingLeft: 10,
    paddingRight: 10,
    color: "rgb(68,68,68)",
    fontWeight: "bold",
  },
  chapter: {
    justifyContent: "center",
    backgroundColor: "#F9CC76",
    color: "black",
    alignItems: "center",
    marginBottom: 1,
  },
  dieu: {
    fontWeight: "bold",
    textAlign: "justify",
    marginTop: 10,
    paddingLeft: 10,
    paddingRight: 10,
    lineHeight: 22,
    alignItems: "center",
    justifyContent: "center",
    color: "black",
  },
  lines: {
    textAlign: "justify",
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 0,
    fontSize: 14,
    color: "black",
    lineHeight: 23,
  },
  // Thu gọn: display:"none" ẩn HẲN khỏi layout. Trước dùng { height: 0 } nhưng RN
  // không clip nội dung con nếu thiếu overflow:"hidden" -> bấm collapse như vô tác dụng.
  content: { display: "none" },
  empty: { color: "#C62828", textAlign: "center", marginTop: 80 },
  functionTab: {
    position: "absolute",
    left: 0,
    right: 0,
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-around",
    bottom: 0,
    backgroundColor: "white",
    paddingTop: 3,
    zIndex: 10,
    borderTopWidth: 2,
    borderTopColor: "black",
    alignItems: "center",
  },
  tab: {
    borderRadius: 30,
    width: "15%",
    height: 40,
    textAlign: "center",
    justifyContent: "center",
    display: "flex",
    alignItems: "center",
  },
  innerTab: { color: "black", textAlign: "center", fontWeight: "bold", fontSize: 18 },
  ModalInfoContainer: {
    display: "flex",
    flexDirection: "row",
    paddingLeft: "2%",
    paddingRight: "2%",
    flexWrap: "wrap",
    borderWidth: 2,
    borderTopWidth: 2,
    borderBottomWidth: 0,
    marginLeft: 5,
    justifyContent: "center",
    alignItems: "center",
    width: "95%",
  },
  ModalInfoTitle: {
    paddingBottom: 10,
    paddingTop: 10,
    fontWeight: "bold",
    fontSize: 15,
    color: "black",
    paddingRight: 5,
    top: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  ModalInfoContent: {
    paddingBottom: 10,
    paddingTop: 10,
    flex: 1,
    color: "black",
    fontSize: 14,
    paddingLeft: "4%",
    textAlignVertical: "center",
  },
  ModalInfoContentLawRelated: {
    paddingBottom: 5,
    paddingTop: 5,
    flex: 1,
    color: "black",
    fontSize: 14,
    paddingLeft: "4%",
  },
  IconInfo: { fontSize: 28, display: "flex", color: "white", fontWeight: "bold" },
});
