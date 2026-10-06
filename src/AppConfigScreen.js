/**
 * Màn sửa cấu hình app: LawMachine.AppConfig trên Mongo (qua /getAppConfig, /saveAppConfig).
 * Mỗi doc là 1 thẻ; field sửa theo đúng kiểu gốc (boolean = Switch, number, string,
 * json cho object/array/null) để lưu xong không đổi kiểu dữ liệu app đang đọc.
 */
import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Switch,
  Alert,
  StyleSheet,
} from "react-native";
import { getAppConfig, saveAppConfig, deleteAppConfig } from "./api";

const TYPES = ["string", "number", "boolean", "json"];

function typeOf(v) {
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  return "json";
}

// doc Mongo -> danh sách field sửa được (number/json giữ dạng text cho TextInput)
function toFields(doc) {
  return Object.entries(doc)
    .filter(([k]) => k !== "_id")
    .map(([key, v]) => {
      const type = typeOf(v);
      return {
        key,
        type,
        value: type === "boolean" ? v : type === "json" ? JSON.stringify(v, null, 2) : String(v),
      };
    });
}

// danh sách field -> doc để lưu; ném lỗi nếu number/json sai hoặc trùng tên
function toDoc(fields) {
  const doc = {};
  for (const f of fields) {
    const key = f.key.trim();
    if (!key) throw new Error("Có field chưa đặt tên");
    if (key === "_id") throw new Error("Không được sửa _id");
    if (key in doc) throw new Error(`Trùng tên field "${key}"`);
    if (f.type === "boolean") doc[key] = !!f.value;
    else if (f.type === "number") {
      const n = Number(String(f.value).trim());
      if (String(f.value).trim() === "" || Number.isNaN(n)) throw new Error(`"${key}" không phải số`);
      doc[key] = n;
    } else if (f.type === "json") {
      try {
        doc[key] = JSON.parse(f.value);
      } catch {
        throw new Error(`"${key}" không phải JSON hợp lệ`);
      }
    } else doc[key] = f.value;
  }
  return doc;
}

// đổi kiểu 1 field: cố giữ giá trị hiện tại nếu chuyển được
function convertValue(f, type) {
  if (type === f.type) return f.value;
  if (type === "boolean") return f.value === true || f.value === "true";
  return String(f.value ?? "");
}

function ConfigCard({ doc, onSaved, onDeleted }) {
  const [fields, setFields] = useState(() => toFields(doc));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  function update(i, patch) {
    setFields((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
    setDirty(true);
    setMsg("");
  }

  function removeField(i) {
    setFields((prev) => prev.filter((_, j) => j !== i));
    setDirty(true);
    setMsg("");
  }

  function addField() {
    setFields((prev) => [...prev, { key: "", type: "string", value: "" }]);
    setDirty(true);
    setMsg("");
  }

  function reset() {
    setFields(toFields(doc));
    setDirty(false);
    setError("");
    setMsg("");
  }

  async function save() {
    setError("");
    setMsg("");
    let next;
    try {
      next = toDoc(fields);
    } catch (e) {
      setError(e.message);
      return;
    }
    setBusy(true);
    try {
      const saved = await saveAppConfig(doc._id, next);
      setFields(toFields(saved));
      setDirty(false);
      setMsg("✓ Đã lưu lên Mongo");
      onSaved(saved);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Xoá doc", `Xoá hẳn "${doc._id}" khỏi AppConfig?`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteAppConfig(doc._id);
            onDeleted(doc._id);
          } catch (e) {
            setError(e.message || String(e));
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.docId}>
          {doc._id}
          {dirty ? <Text style={styles.dirty}>  • chưa lưu</Text> : null}
        </Text>
        <TouchableOpacity onPress={confirmDelete} disabled={busy}>
          <Text style={styles.danger}>Xoá doc</Text>
        </TouchableOpacity>
      </View>

      {fields.map((f, i) => (
        <View key={i} style={styles.field}>
          <View style={styles.fieldHead}>
            <TextInput
              style={styles.keyInput}
              value={f.key}
              onChangeText={(key) => update(i, { key })}
              placeholder="tên field"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => removeField(i)}>
              <Text style={styles.danger}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.types}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeBtn, f.type === t && styles.typeBtnOn]}
                onPress={() => update(i, { type: t, value: convertValue(f, t) })}
              >
                <Text style={[styles.typeText, f.type === t && styles.typeTextOn]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {f.type === "boolean" ? (
            <View style={styles.switchRow}>
              <Switch
                value={!!f.value}
                onValueChange={(value) => update(i, { value })}
                trackColor={{ true: "#2E7D32", false: "#444" }}
                thumbColor={f.value ? "#4CAF50" : "#bbb"}
              />
              <Text style={styles.switchText}>{f.value ? "true" : "false"}</Text>
            </View>
          ) : (
            <TextInput
              style={[styles.valueInput, f.type === "json" && styles.mono]}
              value={f.value}
              onChangeText={(value) => update(i, { value })}
              keyboardType={f.type === "number" ? "decimal-pad" : "default"}
              multiline={f.type !== "number"}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={f.type === "json" ? '{"a": 1}  /  [1, 2]  /  null' : ""}
              placeholderTextColor="#666"
            />
          )}
        </View>
      ))}

      <TouchableOpacity onPress={addField}>
        <Text style={styles.add}>+ Thêm field</Text>
      </TouchableOpacity>

      {!!error && <Text style={styles.error}>Lỗi: {error}</Text>}
      {!!msg && <Text style={styles.ok}>{msg}</Text>}

      <View style={styles.actions}>
        <TouchableOpacity onPress={reset} disabled={busy || !dirty}>
          <Text style={[styles.reload, !dirty && styles.disabled]}>Hoàn tác</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, (!dirty || busy) && styles.saveBtnOff]}
          onPress={save}
          disabled={busy || !dirty}
        >
          <Text style={styles.saveText}>{busy ? "Đang lưu..." : "Lưu"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AppConfigScreen({ onBack }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newId, setNewId] = useState("");
  // đổi khi tải lại -> các thẻ dựng lại từ dữ liệu Mongo mới
  const [version, setVersion] = useState(0);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setDocs(await getAppConfig());
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function addDoc() {
    const id = newId.trim();
    if (!id) return;
    if (docs.some((d) => d._id === id)) {
      setError(`Đã có doc "${id}"`);
      return;
    }
    // chỉ tạo trên app; bấm Lưu mới upsert lên Mongo
    setDocs((prev) => [...prev, { _id: id }]);
    setNewId("");
    setError("");
  }

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
        <Text style={styles.title}>AppConfig</Text>
        <Text style={styles.sub}>Mongo LawMachine.AppConfig</Text>

        {loading && <ActivityIndicator color="#4CAF50" style={{ margin: 12 }} />}
        {!!error && <Text style={styles.error}>Lỗi: {error}</Text>}

        {docs.map((d) => (
          <ConfigCard
            key={`${version}:${d._id}`}
            doc={d}
            onSaved={(saved) => setDocs((prev) => prev.map((x) => (x._id === saved._id ? saved : x)))}
            onDeleted={(id) => setDocs((prev) => prev.filter((x) => x._id !== id))}
          />
        ))}
        {!loading && !error && docs.length === 0 && (
          <Text style={styles.empty}>AppConfig chưa có doc nào.</Text>
        )}

        <View style={styles.newRow}>
          <TextInput
            style={styles.newInput}
            value={newId}
            onChangeText={setNewId}
            placeholder="_id doc mới"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.addBtn} onPress={addDoc}>
            <Text style={styles.saveText}>+ Doc</Text>
          </TouchableOpacity>
        </View>
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
  disabled: { opacity: 0.4 },
  title: { color: "#eee", fontSize: 18, fontWeight: "600", marginTop: 10 },
  sub: { color: "#888", fontSize: 12, marginBottom: 10 },
  error: { color: "#ff6b6b", marginVertical: 6 },
  ok: { color: "#4CAF50", marginVertical: 6 },
  empty: { color: "#888", textAlign: "center", marginTop: 24 },
  card: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    backgroundColor: "#1a1a1a",
    padding: 10,
    marginBottom: 12,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  docId: { color: "#eee", fontSize: 16, fontWeight: "600", flex: 1 },
  dirty: { color: "#FF9800", fontSize: 12, fontWeight: "400" },
  danger: { color: "#ff6b6b", fontSize: 14, paddingHorizontal: 4 },
  field: { borderTopWidth: 1, borderTopColor: "#262626", paddingVertical: 8 },
  fieldHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  keyInput: { flex: 1, color: "#90CAF9", fontSize: 14, fontWeight: "600", padding: 4 },
  types: { flexDirection: "row", gap: 6, marginVertical: 6 },
  typeBtn: { borderWidth: 1, borderColor: "#444", borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 },
  typeBtnOn: { borderColor: "#1565C0", backgroundColor: "#1565C0" },
  typeText: { color: "#888", fontSize: 11 },
  typeTextOn: { color: "#fff" },
  valueInput: {
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    color: "#eee",
    backgroundColor: "#1e1e1e",
    padding: 8,
    textAlignVertical: "top",
  },
  mono: { fontFamily: "monospace", fontSize: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  switchText: { color: "#eee" },
  add: { color: "#4CAF50", fontSize: 14, marginTop: 6 },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 16, marginTop: 8 },
  saveBtn: { backgroundColor: "#2E7D32", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 18 },
  saveBtnOff: { opacity: 0.4 },
  saveText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  newRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 },
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
});
