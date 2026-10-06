import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { CHECK_BUTTONS, URL_MAP } from "./config";
import { check } from "./api";
import { load, save } from "./session";

const CheckScreen = forwardRef(function CheckScreen({ onOpenLaw, onOpenConfig }, ref) {
  // danh sách lần check gần nhất lưu xuống máy (app bị tắt khi chạy nền vẫn còn)
  const [saved] = useState(() => load("check") || {});
  const [url, setUrl] = useState(saved.url || "");
  const [items, setItems] = useState(Array.isArray(saved.items) ? saved.items : []);
  const [note, setNote] = useState(saved.note || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cho phép màn ngoài (App) xóa 1 item khỏi danh sách sau khi push thành công.
  useImperativeHandle(ref, () => ({
    removeByHref: (href) =>
      setItems((prev) => prev.filter(([, h]) => h !== href)),
  }));

  useEffect(() => {
    const t = setTimeout(() => save("check", { url, items, note }), 500);
    return () => clearTimeout(t);
  }, [url, items, note]);

  async function runCheck(target) {
    if (!target) return;
    setLoading(true);
    setError("");
    setNote("");
    try {
      const { content, total, hidden, dedupError } = await check(target);
      setItems(Object.entries(content));
      setNote(
        dedupError
          ? `⚠ Lọc trùng lỗi (Mongo): ${dedupError} — đang hiện tất cả ${total}`
          : `${total} văn bản • ${hidden} đã có (ẩn) • ${total - hidden} mới`,
      );
    } catch (e) {
      setError(e.message || String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Kiểm tra văn bản mới</Text>
        <TouchableOpacity onPress={onOpenConfig}>
          <Text style={styles.configBtn}>⚙ AppConfig</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        value={url}
        onChangeText={setUrl}
        placeholder="Dán URL trang danh sách cần kiểm tra..."
        placeholderTextColor="#888"
        multiline
      />

      <View style={styles.grid}>
        {CHECK_BUTTONS.map((b) => (
          <TouchableOpacity
            key={b.key}
            style={styles.btn}
            onPress={() => {
              const target = b.key === "manual" ? url : URL_MAP[b.key];
              // Hiện text link lên ô input (kể cả khi bấm preset Nghị Định...).
              if (b.key !== "manual") setUrl(target);
              runCheck(target);
            }}
          >
            <Text style={styles.btnText} numberOfLines={1}>
              {b.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && <ActivityIndicator style={{ marginVertical: 12 }} color="#4CAF50" />}
      {!!note && !loading && <Text style={styles.note}>{note}</Text>}
      {!!error && <Text style={styles.error}>Lỗi: {error}</Text>}

      <ScrollView style={{ flex: 1 }}>
        {items.map(([name, href], i) => (
          <TouchableOpacity key={i} style={styles.row} onPress={() => onOpenLaw(href)}>
            <Text style={styles.rowIdx}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{name}</Text>
              <Text style={styles.rowUrl} numberOfLines={1}>
                {href}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
        {!loading && items.length === 0 && (
          <Text style={styles.empty}>Chưa có dữ liệu. Chọn một loại văn bản ở trên.</Text>
        )}
      </ScrollView>
    </View>
  );
});

export default CheckScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: "#141414" },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { color: "#eee", fontSize: 18, fontWeight: "600" },
  configBtn: { color: "#FF9800", fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    color: "#eee",
    backgroundColor: "#1e1e1e",
    padding: 10,
    minHeight: 60,
    textAlignVertical: "top",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  btn: {
    backgroundColor: "#2a2a2a",
    borderColor: "#555",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  btnText: { color: "#eee", fontSize: 13 },
  note: { color: "#4CAF50", fontSize: 12, marginBottom: 6 },
  error: { color: "#ff6b6b", marginVertical: 6 },
  row: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  rowIdx: { color: "#888", width: 24, textAlign: "center" },
  rowName: { color: "#eee", fontSize: 14 },
  rowUrl: { color: "#4CAF50", fontSize: 11 },
  empty: { color: "#888", textAlign: "center", marginTop: 24 },
});
