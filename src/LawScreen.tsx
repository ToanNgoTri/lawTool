import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { scrapeLaw, processLaw, pushLaw, checkExists, ProcessResult } from "./api";
import Detail5View from "./Detail5View";

type Props = { url: string; onBack: () => void };

export default function LawScreen({ url, onBack }: Props) {
  const [processed, setProcessed] = useState<ProcessResult | null>(null);
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState<"pipeline" | "push" | "">("pipeline");
  const [error, setError] = useState("");

  // Lấy data -> chuyển đổi -> checkExists, tất cả tự động (không màn trung gian).
  const runPipeline = useCallback(async () => {
    setBusy("pipeline");
    setError("");
    setProcessed(null);
    try {
      const raw = await scrapeLaw(url);
      const result = await processLaw(raw);

      const lawInfoPush = result.lawInfo;
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

      setProcessed(result);
      try {
        setExists(await checkExists(result.lawNumberForPush));
      } catch {
        setExists(false);
      }
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy("");
    }
  }, [url]);

  useEffect(() => {
    runPipeline();
  }, [runPipeline]);

  async function runPush(force: boolean) {
    if (!processed) return;
    setBusy("push");
    setError("");
    try {
      const r = await pushLaw({
        lawInfo: processed.lawInfo,
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
        Alert.alert("Thành công", `Đã push ${r.lawNumberForPush}\n${r.chunks} chunks lên Firestore + Mongo`, [
          { text: "OK", onPress: onBack }, // quay về danh sách (mục này giờ sẽ bị ẩn)
        ]);
      } else {
        // Nêu rõ phần nào hỏng (Firestore/Mongo) để dễ chẩn đoán.
        const detail =
          `Mongo: ${r.mongoOk ? "OK" : "FAIL"} | Firestore: ${r.firestoreOk ? "OK" : "FAIL"}` +
          (r.firestoreError ? `\nFirestore error: ${r.firestoreError}` : "");
        throw new Error(detail);
      }
    } catch (e: any) {
      setError(e.message || String(e));
      Alert.alert("Lỗi push", e.message || String(e));
    } finally {
      setBusy("");
    }
  }

  // Đang lấy/chuyển đổi
  if (busy === "pipeline") {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Đang lấy & chuyển đổi...</Text>
        <Text style={styles.url} numberOfLines={2}>{url}</Text>
      </View>
    );
  }

  // Lỗi
  if (error && !processed) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Lỗi: {error}</Text>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 16 }}>
          <TouchableOpacity style={styles.btn} onPress={onBack}>
            <Text style={styles.btnText}>← Danh sách</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={runPipeline}>
            <Text style={styles.btnText}>↻ Thử lại</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!processed) return null;

  return (
    <Detail5View
      content={processed.data}
      info={processed.lawInfo}
      exists={exists}
      pushing={busy === "push"}
      onBack={onBack}
      onReload={runPipeline}
      onPush={() => runPush(false)}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#141414", padding: 20 },
  loadingText: { color: "#eee", marginTop: 12, fontSize: 15 },
  url: { color: "#888", fontSize: 11, marginTop: 8, textAlign: "center" },
  error: { color: "#ff6b6b", fontSize: 14, textAlign: "center" },
  btn: { backgroundColor: "#2a2a2a", borderColor: "#555", borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  btnText: { color: "#eee", fontSize: 14 },
});
