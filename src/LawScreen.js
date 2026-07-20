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
} from "react-native";
import { scrapeLaw, processLaw, pushLaw, checkExists } from "./api";
import Detail5View from "./Detail5View";

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

export default function LawScreen({ url, onBack, onPushed }) {
  const [raw, setRaw] = useState(EMPTY);
  const [processed, setProcessed] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState("scrape");
  const [error, setError] = useState("");
  const [pushed, setPushed] = useState(false);
  const scrollRef = useRef(null);
  // Bản scrape gốc — làm ĐẦU VÀO convert cho lawDaySign/lawDescription (form giữ bản đã convert).
  const scrapedRef = useRef(EMPTY);

  const setField = (k, v) => {
    setRaw((prev) => ({ ...prev, [k]: v }));
    if (!DISPLAY_KEYS.has(k)) setProcessed(null); // sửa trường ĐẦU VÀO -> phải xử lý lại
  };

  // Convert: đầu vào = trường hiện tại + lawDaySign/lawDescription lấy từ BẢN GỐC.
  const runProcess = useCallback(async (formRaw) => {
    setBusy("process");
    setError("");
    try {
      const base = scrapedRef.current;
      const input = {
        ...formRaw,
        lawDaySign: base.lawDaySign,
        lawDescription: base.lawDescription,
      };
      const result = await processLaw(input);
      setProcessed(result);
      const li = result.lawInfo || {};
      // Điền các trường ĐÃ CHUYỂN ĐỔI vào form. content -> hiển thị bản output đã
      // convert (partTwo) giống trang once của nextLawTool, không giữ text thô.
      setRaw((prev) => ({
        ...prev,
        content: typeof result.output === "string" && result.output ? result.output : prev.content,
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
        scrapedRef.current = scraped;
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

  // Lần đầu vào màn: scrape + tự Get content.
  useEffect(() => {
    doScrape(true);
  }, [doScrape]);

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

  // ─── Detail5: xem lần cuối trước khi push ───────────────────────────────────
  if (showDetail && processed) {
    return (
      <Detail5View
        content={processed.data}
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
    <View style={{ flex: 1, backgroundColor: "#141414" }}>
      <ScrollView ref={scrollRef} style={styles.container} keyboardShouldPersistTaps="handled">
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
          <View key={f.key} style={{ marginBottom: 8 }}>
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

        {!processed && !busy && (
          <Text style={styles.hint}>Sửa trường đầu vào xong bấm "Detail5 →" để chuyển đổi lại & xem.</Text>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Nút cuộn lên đầu / xuống cuối */}
      <View style={styles.fabColumn}>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
        >
          <Text style={styles.fabText}>↑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fab}
          onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <Text style={styles.fabText}>↓</Text>
        </TouchableOpacity>
      </View>
    </View>
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
