/**
 * Màn quản lý văn bản tải sẵn: LawMachine.DefaultLaws trên Mongo
 * (qua /getDefaultLaws, /searchLaws, /saveDefaultLaws).
 * App lawMachine tự tải các văn bản này về máy ở lần mở đầu tiên sau khi cài,
 * theo đúng thứ tự trong danh sách.
 */
import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import {
  getDefaultLaws,
  searchLaws,
  addDefaultLaw,
  removeDefaultLaw,
  orderDefaultLaws,
} from "./api";

function LawLine({ id, info }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.lawId}>{id}</Text>
      {info ? (
        <Text style={styles.lawName} numberOfLines={2}>
          {info.lawNameDisplay || info.lawDescription || ""}
        </Text>
      ) : (
        <Text style={styles.missing}>Không còn trong DB — app sẽ bỏ qua</Text>
      )}
    </View>
  );
}

export default function DefaultLawsScreen({ onBack }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setDocs(await getDefaultLaws());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  // chạy 1 thao tác ghi rồi tải lại danh sách từ Mongo
  async function run(fn, okMsg) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await fn();
      setMsg(okMsg);
      setDocs(await getDefaultLaws());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError("");
    try {
      setResults(await searchLaws(q));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSearching(false);
    }
  }

  function add(id) {
    run(() => addDefaultLaw(id), `✓ Đã thêm ${id}`);
  }

  function confirmRemove(id) {
    Alert.alert("Bỏ văn bản", `Bỏ "${id}" khỏi danh sách tải sẵn?`, [
      { text: "Huỷ", style: "cancel" },
      { text: "Bỏ", style: "destructive", onPress: () => run(() => removeDefaultLaw(id), `✓ Đã bỏ ${id}`) },
    ]);
  }

  // đổi chỗ với văn bản kề trên (dir=-1) / kề dưới (dir=1)
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= docs.length) return;
    const ids = docs.map((d) => d._id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => orderDefaultLaws(ids), "✓ Đã đổi thứ tự");
  }

  const added = new Set(docs.map((d) => d._id));

  return (
    <View style={{ flex: 1, backgroundColor: "#141414" }}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.back}>← Danh sách</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={reload} disabled={loading}>
            <Text style={styles.reload}>↻ Tải lại</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Văn bản tải sẵn</Text>
        <Text style={styles.sub}>
          Mongo LawMachine.DefaultLaws — app tự tải về khi người dùng mới cài
        </Text>

        {(loading || busy) && <ActivityIndicator color="#4CAF50" style={{ margin: 12 }} />}
        {!!error && <Text style={styles.error}>Lỗi: {error}</Text>}
        {!!msg && <Text style={styles.ok}>{msg}</Text>}

        {docs.map((d, i) => (
          <View key={d._id} style={styles.card}>
            <Text style={styles.order}>{i + 1}</Text>
            <LawLine id={d._id} info={d.info} />
            <View style={styles.side}>
              <TouchableOpacity onPress={() => move(i, -1)} disabled={busy || i === 0}>
                <Text style={[styles.arrow, i === 0 && styles.disabled]}>▲</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => move(i, 1)} disabled={busy || i === docs.length - 1}>
                <Text style={[styles.arrow, i === docs.length - 1 && styles.disabled]}>▼</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => confirmRemove(d._id)} disabled={busy}>
              <Text style={styles.danger}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        {!loading && !busy && !error && docs.length === 0 && (
          <Text style={styles.empty}>Chưa có văn bản nào.</Text>
        )}

        <Text style={styles.section}>Thêm văn bản</Text>
        <View style={styles.newRow}>
          <TextInput
            style={styles.newInput}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
            placeholder="Số hiệu, tên hoặc trích yếu..."
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.addBtn} onPress={search} disabled={searching}>
            <Text style={styles.btnText}>{searching ? "..." : "Tìm"}</Text>
          </TouchableOpacity>
        </View>

        {results.map((r) => (
          <View key={r._id} style={styles.card}>
            <LawLine id={r._id} info={r.info} />
            {added.has(r._id) ? (
              <Text style={styles.ok}>Đã có</Text>
            ) : (
              <TouchableOpacity style={styles.addBtn} onPress={() => add(r._id)} disabled={busy}>
                <Text style={styles.btnText}>+ Thêm</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {!searching && query.trim() !== "" && results.length === 0 && (
          <Text style={styles.empty}>Nhấn Tìm để tìm văn bản trong DB.</Text>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: "#141414" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { color: "#4CAF50", fontSize: 15 },
  reload: { color: "#FF9800", fontSize: 15 },
  disabled: { opacity: 0.3 },
  title: { color: "#eee", fontSize: 18, fontWeight: "600", marginTop: 10 },
  sub: { color: "#888", fontSize: 12, marginBottom: 10 },
  section: { color: "#eee", fontSize: 15, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  error: { color: "#ff6b6b", marginVertical: 6 },
  ok: { color: "#4CAF50", marginVertical: 6 },
  empty: { color: "#888", textAlign: "center", marginVertical: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    backgroundColor: "#1a1a1a",
    padding: 10,
    marginBottom: 8,
  },
  order: { color: "#888", fontSize: 14, width: 20, textAlign: "center" },
  lawId: { color: "#90CAF9", fontSize: 14, fontWeight: "600" },
  lawName: { color: "#ccc", fontSize: 13, marginTop: 2 },
  missing: { color: "#FF9800", fontSize: 12, marginTop: 2 },
  side: { gap: 6 },
  arrow: { color: "#eee", fontSize: 16, paddingHorizontal: 4 },
  danger: { color: "#ff6b6b", fontSize: 16, paddingHorizontal: 4 },
  newRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 },
  newInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    color: "#eee",
    backgroundColor: "#1e1e1e",
    padding: 8,
  },
  addBtn: { backgroundColor: "#1565C0", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
