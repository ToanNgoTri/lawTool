import { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  AppState,
} from "react-native";
import { scrapeLaw, processLaw, pushLaw, checkExists } from "./api";
import Detail5View from "./Detail5View";
import { syncEditedTables } from "./lawTables";
import { loadLaw, saveLaw, saveLawResult, clearLaw } from "./session";

const FIELDS = [
  { key: "lawNumber", label: "lawNumber" },
  { key: "unitPublish", label: "unitPublish (cách nhau bằng ;)" },
  { key: "lawKind", label: "lawKind" },
  { key: "nameSign", label: "nameSign (cách nhau bằng ;)" },
  { key: "lawDaySign", label: "lawDaySign (đã chuyển đổi — ISO)" },
  { key: "lawDayActive", label: "lawDayActive (ngày hiệu lực — sửa được)" },
  { key: "lawNameDisplay", label: "lawNameDisplay (tên hiển thị)" },
  { key: "lawDescription", label: "lawDescription (đã chuyển đổi)", big: true },
  { key: "lawRelated", label: "lawRelated", big: true },
  { key: "roleSign", label: "roleSign", big: true },
  { key: "content", label: "content", big: true },
];

// Trường HIỂN THỊ (kết quả convert): sửa = override, KHÔNG buộc convert lại.
const DISPLAY_KEYS = new Set([
  "lawDaySign",
  "lawDayActive",
  "lawNameDisplay",
  "lawDescription",
]);

const EMPTY = {
  content: "",
  lawNumber: "",
  unitPublish: "",
  lawKind: "",
  nameSign: "",
  lawDaySign: "",
  lawDayActive: "",
  lawNameDisplay: "",
  lawDescription: "",
  lawRelated: "",
  roleSign: "",
};

const toISO = (d) => (d ? (typeof d === "string" ? d : new Date(d).toISOString()) : "");

// Các chuỗi có thể chứa dòng bảng: content + nội dung từng phụ lục (cùng thứ tự).
const tableTexts = (r) => [r.content, ...(r.appendix || []).map((a) => a && a.text)];

// processLaw trả cả `output` (= content đã convert, đã chép vào raw.content) —
// bỏ đi cho đỡ giữ thêm 1 bản văn bản trong RAM / bộ nhớ máy.
const slimResult = (result) => (result ? { ...result, output: undefined } : null);

// Chỉ 2 trường gốc dùng làm đầu vào convert (xem runProcess) — không giữ cả bản scrape.
const scrapedBase = (r) => ({ lawDaySign: r.lawDaySign, lawDescription: r.lawDescription });

export default function LawScreen({ url, onBack, onPushed }) {
  // Phiên đã lưu (app bị Android tắt khi chạy nền rồi mở lại) -> khôi phục y nguyên.
  const [saved] = useState(() => loadLaw(url));
  const [raw, setRaw] = useState(() => (saved?.raw ? { ...EMPTY, ...saved.raw } : EMPTY));
  const [processed, setProcessed] = useState(() => saved?.processed || null);
  const [showDetail, setShowDetail] = useState(() => !!(saved?.showDetail && saved?.processed));
  const [exists, setExists] = useState(() => !!saved?.exists);
  const [busy, setBusy] = useState(saved ? "" : "scrape");
  const [error, setError] = useState("");
  const [pushed, setPushed] = useState(() => !!saved?.pushed);
  const scrollRef = useRef(null);
  // Bản scrape gốc — làm ĐẦU VÀO convert cho lawDaySign/lawDescription (form giữ bản đã convert).
  const scrapedRef = useRef(saved?.scraped || scrapedBase(EMPTY));
  // Các chuỗi ứng với raw.tables hiện tại (lần scrape / xử lý gần nhất) — so với
  // bản đang sửa để biết dòng bảng nào bị sửa (xem syncEditedTables).
  const tableBaseRef = useRef(saved?.tableBase || []);
  // Tăng mỗi lần sửa trường đầu vào: kết quả xử lý về trễ (đã sửa tiếp trong lúc
  // chờ) thì bỏ, không thì Detail5 hiện bản CŨ dù form đã sửa.
  const editSeqRef = useRef(0);

  const setField = (k, v) => {
    setRaw((prev) => ({ ...prev, [k]: v }));
    if (!DISPLAY_KEYS.has(k)) {
      editSeqRef.current++;
      setProcessed(null); // sửa trường ĐẦU VÀO -> phải xử lý lại
    }
  };

  // Phụ lục / quy chế (raw.appendix: [{ title, text }]) là ĐẦU VÀO của processLaw
  // -> sửa / xoá / thêm đều phải xử lý lại.
  const setAppendix = (updater) => {
    setRaw((prev) => ({ ...prev, appendix: updater(prev.appendix || []) }));
    editSeqRef.current++;
    setProcessed(null);
  };
  const updateAppendix = (i, patch) =>
    setAppendix((list) => list.map((a, k) => (k === i ? { ...a, ...patch } : a)));
  const removeAppendix = (i) => setAppendix((list) => list.filter((_, k) => k !== i));
  const addAppendix = () => setAppendix((list) => [...list, { title: "Phụ lục", text: "" }]);

  // Convert: đầu vào = trường hiện tại + lawDaySign/lawDescription lấy từ BẢN GỐC.
  const runProcess = useCallback(async (formRaw) => {
    setBusy("process");
    setError("");
    const seq = editSeqRef.current;
    try {
      const base = scrapedRef.current;
      // Bảng vẽ từ raw.tables -> áp phần chữ đã sửa trong dòng bảng vào đó trước.
      const tables = syncEditedTables(formRaw.tables, tableBaseRef.current, tableTexts(formRaw));
      const input = {
        ...formRaw,
        tables,
        lawDaySign: base.lawDaySign,
        lawDescription: base.lawDescription,
      };
      const result = await processLaw(input);
      if (seq !== editSeqRef.current) return null; // đã sửa tiếp trong lúc xử lý
      setProcessed(slimResult(result));
      const li = result.lawInfo || {};
      const content = typeof result.output === "string" && result.output ? result.output : formRaw.content;
      tableBaseRef.current = tableTexts({ ...formRaw, content });
      // Điền các trường ĐÃ CHUYỂN ĐỔI vào form. content -> hiển thị bản output đã
      // convert (partTwo) giống trang once của nextLawTool, không giữ text thô.
      setRaw((prev) => ({
        ...prev,
        tables,
        content,
        lawDaySign: toISO(li.lawDaySign) || prev.lawDaySign,
        lawDayActive: toISO(li.lawDayActive),
        lawNameDisplay: li.lawNameDisplay || "",
        lawDescription: li.lawDescription || prev.lawDescription,
      }));
      try {
        setExists(await checkExists(result.lawNumberForPush));
      } catch {
        setExists(false);
      }
      return result;
    } catch (e) {
      setError(e.message || String(e));
      return null;
    } finally {
      setBusy("");
    }
  }, []);

  // scrape -> đổ form. autoProcess=true (lần đầu vào) thì tự "Get content" luôn;
  // false (bấm "Lấy lại") thì chỉ đổ form để user sửa rồi tự bấm "Get content".
  const doScrape = useCallback(
    async (autoProcess = false) => {
      setBusy("scrape");
      setError("");
      setProcessed(null);
      setPushed(false);
      setShowDetail(false);
      try {
        const scraped = { ...EMPTY, ...(await scrapeLaw(url)) };
        scrapedRef.current = scrapedBase(scraped);
        tableBaseRef.current = tableTexts(scraped);
        editSeqRef.current++;
        setRaw(scraped);
        if (autoProcess) {
          await runProcess(scraped);
        } else {
          setBusy("");
        }
      } catch (e) {
        setError(e.message || String(e));
        setBusy("");
      }
    },
    [url, runProcess],
  );

  // Lần đầu vào màn: scrape + tự Get content (có phiên đã lưu thì dùng lại).
  useEffect(() => {
    if (!saved) doScrape(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doScrape]);

  // ─── Lưu phiên xuống máy ────────────────────────────────────────────────────
  // Sửa form -> lưu sau 800ms ngừng gõ; app xuống nền -> lưu NGAY (Android có thể
  // tắt app bất cứ lúc nào sau đó). Push xong thì xoá phiên.
  const snapshot = () => ({
    raw,
    scraped: scrapedRef.current,
    tableBase: tableBaseRef.current,
    showDetail,
    exists,
    pushed,
  });
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const canSave = busy !== "scrape" && raw !== EMPTY;

  const flush = useCallback(() => {
    const snap = snapshotRef.current();
    if (snap.pushed) clearLaw(url);
    else saveLaw(url, snap);
  }, [url]);

  useEffect(() => {
    if (!canSave) return;
    const t = setTimeout(flush, 800);
    return () => clearTimeout(t);
  }, [raw, showDetail, exists, pushed, canSave, flush]);

  useEffect(() => {
    if (busy === "scrape" || pushed) return;
    saveLawResult(url, processed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processed]);

  const canSaveRef = useRef(canSave);
  canSaveRef.current = canSave;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active" && canSaveRef.current) flush();
    });
    return () => sub.remove();
  }, [flush]);

  useEffect(() => {
    const onHwBack = () => {
      if (showDetail) {
        setShowDetail(false);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onHwBack);
    return () => sub.remove();
  }, [showDetail]);

  // lawInfo cuối = kết quả convert + override từ các trường hiển thị đã sửa.
  const mergedInfo = () =>
    processed
      ? {
          ...processed.lawInfo,
          lawDaySign: raw.lawDaySign,
          lawDayActive: raw.lawDayActive,
          lawNameDisplay: raw.lawNameDisplay,
          lawDescription: raw.lawDescription,
        }
      : null;

  // Nút Detail5: nếu chưa có kết quả (vừa sửa đầu vào) thì convert trước rồi nhảy qua.
  async function goToDetail() {
    if (processed) {
      setShowDetail(true);
      return;
    }
    const res = await runProcess(raw);
    if (res) setShowDetail(true);
  }

  async function runPush(force) {
    const info = mergedInfo();
    if (!processed || !info) return;
    setBusy("push");
    setError("");
    try {
      const r = await pushLaw({
        lawInfo: info,
        data: processed.data,
        fullText: processed.fullText,
        tables: processed.tables,
        force,
      });
      if (r.duplicate) {
        Alert.alert("Đã có rồi", `${r.lawNumberForPush} đã tồn tại. Ghi đè?`, [
          { text: "Thoát", style: "cancel" },
          { text: "Ghi đè", onPress: () => runPush(true) },
        ]);
        return;
      }
      if (r.success) {
        // Push xong -> xóa item này khỏi danh sách màn hình chính, đổi nút thành "Thành công".
        onPushed?.(url);
        setPushed(true);
      } else {
        const detail =
          `Mongo: ${r.mongoOk ? "OK" : "FAIL"} | Chunks: ${r.chunksOk ? "OK" : "FAIL"}` +
          (r.chunksError ? `\nChunks error: ${r.chunksError}` : "");
        throw new Error(detail);
      }
    } catch (e) {
      setError(e.message || String(e));
      Alert.alert("Lỗi push", e.message || String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Nút ↑/↓: nhảy theo MỐC ────────────────────────────────────────────────
  //  ↑: đầu lawNumber, đầu content, đầu nội dung phụ lục 1, 2… -> tới mốc gần nhất
  //     PHÍA TRÊN chỗ đang xem (hết mốc thì lên đầu màn).
  //  ↓: cuối content, cuối nội dung phụ lục 1, 2… -> mốc gần nhất PHÍA DƯỚI
  //     (hết mốc thì xuống cuối màn).
  //  Nhấn giữ (long press): lên thẳng đầu / xuống thẳng cuối.
  // Vị trí đo bằng onLayout (toạ độ trong nội dung ScrollView).
  // Mốc không đặt sát mép màn mà chừa CONTEXT_RATIO chiều cao màn để thấy phần
  // trước (↑) / sau (↓) mốc.
  // Mốc cách chỗ đang xem / cách đầu-cuối màn chưa tới MIN_STEP_RATIO màn thì bỏ
  // qua (nhảy luôn tới mốc kế / đầu-cuối) — không thì 1 lần bấm chỉ nhích vài px
  // (vd mốc lawNumber sát đầu màn, cuối phụ lục cuối sát cuối màn), phải bấm 2 lần.
  const layoutRef = useRef({ fields: {}, apBox: {}, apText: {} });
  const scrollYRef = useRef(0);
  // chiều cao màn KHI KHÔNG có bàn phím (lớn nhất từng đo) — có bàn phím thì
  // ScrollView co lại, nhảy theo chiều cao đó sẽ lệch khi bàn phím đóng.
  const viewHRef = useRef(0);
  const contentHRef = useRef(0);
  const CONTEXT_RATIO = 0.2;
  const MIN_STEP_RATIO = 0.15;

  function anchors() {
    const { fields, apBox, apText } = layoutRef.current;
    const tops = [];
    const bottoms = [];
    if (fields.lawNumber) tops.push(fields.lawNumber.y);
    if (fields.content) {
      tops.push(fields.content.y);
      bottoms.push(fields.content.y + fields.content.height);
    }
    (raw.appendix || []).forEach((_, i) => {
      const box = apBox[i];
      const txt = apText[i];
      if (!box || !txt) return;
      tops.push(box.y + txt.y);
      bottoms.push(box.y + txt.y + txt.height);
    });
    return { tops, bottoms };
  }

  function jump(down) {
    const sv = scrollRef.current;
    if (!sv) return;
    const y = scrollYRef.current;
    const viewH = viewHRef.current;
    const gap = Math.round(viewH * CONTEXT_RATIO);
    const minStep = Math.round(viewH * MIN_STEP_RATIO);
    const maxY = Math.max(0, contentHRef.current - viewH);
    const { tops, bottoms } = anchors();
    if (down) {
      const targets = bottoms
        .map((b) => Math.min(maxY, Math.max(0, b - viewH + gap)))
        .filter((t) => t > y + minStep)
        .sort((a, b) => a - b);
      if (targets.length && targets[0] < maxY - minStep) scrollToY(targets[0]);
      else scrollToEdge(true);
    } else {
      const targets = tops
        .map((t) => Math.max(0, t - gap))
        .filter((t) => t < y - minStep)
        .sort((a, b) => b - a);
      if (targets.length && targets[0] > minStep) scrollToY(targets[0]);
      else scrollToEdge(false);
    }
  }

  // Cuộn bằng code (animated) trên Android không phải lúc nào cũng bắn sự kiện
  // onScroll cuối -> scrollYRef kẹt ở vị trí giữa chừng, lần bấm sau tính sai mốc.
  // Ghi luôn vị trí đích.
  function scrollToY(target) {
    scrollRef.current?.scrollTo({ y: target, animated: true });
    scrollYRef.current = target;
  }

  function scrollToEdge(down) {
    if (down) {
      scrollRef.current?.scrollToEnd({ animated: true });
      scrollYRef.current = Math.max(0, contentHRef.current - viewHRef.current);
    } else scrollToY(0);
  }

  // Đang focus 1 ô nhập thì Android cuộn NGƯỢC về ô đó (giữ con trỏ trong tầm
  // nhìn) -> bỏ focus + đóng bàn phím TRƯỚC rồi nhảy NGAY (không đợi bàn phím đóng:
  // đợi ~1s khiến tưởng bấm không ăn, phải bấm lần 2). Mốc tính theo chiều cao màn
  // đầy đủ (viewHRef) nên bàn phím đóng xong vẫn đúng chỗ.
  function dismissInput() {
    const focused = TextInput.State.currentlyFocusedInput?.();
    if (focused || Keyboard.isVisible?.()) {
      focused?.blur?.();
      Keyboard.dismiss();
    }
  }

  function scrollStep(down) {
    dismissInput();
    jump(down);
  }

  function scrollEdge(down) {
    dismissInput();
    scrollToEdge(down);
  }

  // ─── Detail5: xem lần cuối trước khi push ───────────────────────────────────
  if (showDetail && processed) {
    return (
      <Detail5View
        content={processed.data}
        tables={processed.tables}
        info={mergedInfo() || processed.lawInfo}
        exists={exists}
        pushing={busy === "push"}
        pushed={pushed}
        onBack={() => setShowDetail(false)}
        onReload={() => runProcess(raw)}
        onPush={() => runPush(false)}
        onDone={onBack}
      />
    );
  }

  // ─── Màn once (sửa trường) ───────────────────────────────────────────────────
  return (
    // targetSdk 36 -> Android 15+ ép edge-to-edge, adjustResize không còn co cửa sổ
    // -> bàn phím đè ScrollView. KeyboardAvoidingView chừa padding bằng phần bị che.
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: "#141414" }}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(e) => (scrollYRef.current = e.nativeEvent.contentOffset.y)}
        onLayout={(e) => (viewHRef.current = Math.max(viewHRef.current, e.nativeEvent.layout.height))}
        onContentSizeChange={(w, h) => (contentHRef.current = h)}
      >
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.back}>← Danh sách</Text>
          </TouchableOpacity>
          <View style={styles.topRight}>
            <TouchableOpacity onPress={() => doScrape(false)} disabled={busy !== ""}>
              <Text style={styles.reload}>↻ Lấy lại</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.contentBtn} onPress={() => runProcess(raw)} disabled={busy !== ""}>
              <Text style={styles.getText}>
                {busy === "process" ? "Đang xử lý..." : "Get content"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.getBtn} onPress={goToDetail} disabled={busy !== "" || !processed}>
              <Text style={{...styles.getText}}>→</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.url} numberOfLines={2}>{url}</Text>

        {(busy === "scrape" || busy === "process") && (
          <ActivityIndicator color="#4CAF50" style={{ margin: 12 }} />
        )}
        {!!error && <Text style={styles.error}>Lỗi: {error}</Text>}

        {FIELDS.map((f) => (
          <View
            key={f.key}
            style={{ marginBottom: 8 }}
            onLayout={(e) => (layoutRef.current.fields[f.key] = e.nativeEvent.layout)}
          >
            <Text style={styles.label}>{f.label}</Text>
            <TextInput
              style={[styles.input, f.big && styles.inputBig]}
              value={raw[f.key]}
              onChangeText={(v) => setField(f.key, v)}
              multiline={f.big}
              placeholderTextColor="#666"
            />
          </View>
        ))}

        <Text style={[styles.label, { marginTop: 8 }]}>
          Phụ lục / quy chế ({(raw.appendix || []).length}) — nối vào cuối content
        </Text>
        {(raw.appendix || []).map((a, i) => (
          <View
            key={`ap${i}`}
            style={styles.appendixBox}
            onLayout={(e) => (layoutRef.current.apBox[i] = e.nativeEvent.layout)}
          >
            <View style={styles.appendixHead}>
              <Text style={styles.label}>Tên phụ lục {i + 1}</Text>
              <TouchableOpacity onPress={() => removeAppendix(i)}>
                <Text style={styles.appendixRemove}>Xóa</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={a.title}
              onChangeText={(v) => updateAppendix(i, { title: v })}
              multiline
              placeholderTextColor="#666"
            />
            <View onLayout={(e) => (layoutRef.current.apText[i] = e.nativeEvent.layout)}>
              <Text style={[styles.label, { marginTop: 6 }]}>Nội dung</Text>
              <TextInput
                style={[styles.input, styles.inputBig]}
                value={a.text}
                onChangeText={(v) => updateAppendix(i, { text: v })}
                multiline
                placeholderTextColor="#666"
              />
            </View>
          </View>
        ))}
        <TouchableOpacity style={styles.appendixAdd} onPress={addAppendix} disabled={busy !== ""}>
          <Text style={styles.appendixAddText}>+ Thêm phụ lục</Text>
        </TouchableOpacity>

        {!processed && !busy && (
          <Text style={styles.hint}>Sửa trường đầu vào xong bấm "Detail5 →" để chuyển đổi lại & xem.</Text>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ↑ đầu lawNumber / content / phụ lục…, ↓ cuối content / phụ lục…; giữ = đầu/cuối màn */}
      <View style={styles.fabColumn}>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => scrollStep(false)}
          onLongPress={() => scrollEdge(false)}
        >
          <Text style={styles.fabText}>↑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => scrollStep(true)}
          onLongPress={() => scrollEdge(true)}
        >
          <Text style={styles.fabText}>↓</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: "#141414" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { color: "#4CAF50", fontSize: 15 },
  reload: { color: "#FF9800", fontSize: 15 },
  getBtn: { backgroundColor: "#1565C0", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  contentBtn: { backgroundColor: "#2E7D32", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  getText: { color: "#fff", fontWeight: "600", fontSize: 14,padding:5 },
  url: { color: "#888", fontSize: 11, marginVertical: 6 },
  label: { color: "#aaa", fontSize: 12, marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 6,
    color: "#eee",
    backgroundColor: "#1e1e1e",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  inputBig: { minHeight: 90, textAlignVertical: "top" },
  appendixBox: {
    borderLeftWidth: 3,
    borderLeftColor: "#26A69A",
    paddingLeft: 8,
    marginBottom: 10,
  },
  appendixHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  appendixRemove: { color: "#ff6b6b", fontSize: 13, paddingHorizontal: 6 },
  appendixAdd: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#26A69A",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  appendixAddText: { color: "#26A69A", fontSize: 13 },
  hint: { color: "#888", fontSize: 12, marginTop: 10, textAlign: "center" },
  error: { color: "#ff6b6b", marginVertical: 6 },
  fabColumn: {
    position: "absolute",
    right: 16,
    bottom: 24,
    gap: 12,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#4CAF50",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: "#fff", fontSize: 24, fontWeight: "700", lineHeight: 26 },
});
