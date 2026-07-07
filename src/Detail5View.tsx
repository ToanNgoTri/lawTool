import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

// Renderer chỉ-đọc mô phỏng lawMachine/screens/Detail5.js — để KIỂM TRA data
// (content = mảng chương/phần/điều/khoản, info = lawInfo) có đúng format chưa.

type Props = {
  content: any;
  info: Record<string, any>;
  onBack: () => void;
  onReload: () => void;
  onPush: () => void;
  pushing: boolean;
  exists: boolean;
};

// ─── Helpers port từ Detail5 (toPlainText / splitClauses / getClauses) ──────────
function toPlainText(raw: any): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.join(" ");
  if (typeof raw === "object") {
    const k = Object.keys(raw)[0];
    return typeof k === "string" ? k : JSON.stringify(raw);
  }
  return String(raw);
}

function splitClauses(text: string): string[] | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const lines = text.split("\n");
  const clauses: string[] = [];
  let cur: string | null = null;
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

function getClauses(raw: any): string[] {
  const text = toPlainText(raw);
  return splitClauses(text) || [text];
}

const isPhan = (k: string) => /^phần thứ .*/i.test(k) || /^(A|B|C|D|E|F|G|H)\./.test(k);
const isChuong = (k: string) => /(^chương .*|^(V|I|X)+\.)/i.test(k);

// ─── Render 1 điều: tiêu đề + các khoản ─────────────────────────────────────────
function Article({ title, raw }: { title: string; raw: any }) {
  const clauses = getClauses(raw);
  return (
    <View style={styles.article}>
      <Text style={styles.dieu}>{title}</Text>
      {clauses.map((c, i) => (
        <Text key={i} style={styles.line}>
          {c}
        </Text>
      ))}
    </View>
  );
}

// mảng các điều (dưới 1 chương)
function ArticleList({ items }: { items: any[] }) {
  return (
    <>
      {(items || []).map((art, i) => {
        const t = Object.keys(art)[0];
        if (t === "0") return null;
        return <Article key={i} title={t} raw={Object.values(art)[0]} />;
      })}
    </>
  );
}

export default function Detail5View({ content, info, onBack, onReload, onPush, pushing, exists }: Props) {
  const [showInfo, setShowInfo] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  // data có thể là mảng hoặc object numeric-keyed -> chuẩn hoá về mảng
  const list: any[] = Array.isArray(content) ? content : Object.values(content || {});

  const renderTop = (item: any, i: number) => {
    const key = Object.keys(item)[0];
    if (key === "0") return null;
    const val = (item as any)[key];

    if (isPhan(key)) {
      return (
        <View key={i}>
          <Text style={styles.chapter}>{key.toUpperCase()}</Text>
          {(val || []).map((keyC: any, iC: number) => {
            const ck = Object.keys(keyC)[0];
            if (isChuong(ck)) {
              return (
                <View key={iC}>
                  <Text style={styles.subChapter}>{ck.toUpperCase()}</Text>
                  <ArticleList items={(keyC as any)[ck]} />
                </View>
              );
            }
            return <Article key={iC} title={ck} raw={Object.values(keyC)[0]} />;
          })}
        </View>
      );
    }
    if (isChuong(key)) {
      return (
        <View key={i}>
          <Text style={styles.chapter}>{key.toUpperCase()}</Text>
          <ArticleList items={val} />
        </View>
      );
    }
    // chỉ có Điều
    return <Article key={i} title={key} raw={val} />;
  };

  const infoRow = (label: string, value: any) => {
    if (value === undefined || value === null || value === "") return null;
    const arr = Array.isArray(value);
    return (
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}</Text>
        <View style={{ flex: 1 }}>
          {arr ? (
            value.map((v: any, i: number) => (
              <Text key={i} style={styles.infoValue}>{`- ${v}`}</Text>
            ))
          ) : (
            <Text style={styles.infoValue}>{String(value)}</Text>
          )}
        </View>
      </View>
    );
  };

  const fmtDate = (d: any) => {
    try {
      return new Date(d).toLocaleDateString("vi-VN");
    } catch {
      return String(d);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Danh sách</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 14 }}>
          <TouchableOpacity onPress={onReload}>
            <Text style={styles.toggle}>↻ Lấy lại</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowInfo((s) => !s)}>
            <Text style={styles.toggle}>{showInfo ? "Ẩn info" : "Info"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {exists && (
        <Text style={styles.dupWarn}>⚠ Văn bản này ĐÃ CÓ trong CSDL — Push sẽ hỏi ghi đè.</Text>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        <Text style={styles.title}>{info?.lawNameDisplay}</Text>

        {showInfo && (
          <View style={styles.infoBox}>
            <Text style={styles.infoHeader}>THÔNG TIN CHI TIẾT</Text>
            {infoRow("Tên gọi:", info?.lawNameDisplay)}
            {infoRow("Trích yếu:", info?.lawDescription)}
            {infoRow("Ngày ký:", info?.lawDaySign ? fmtDate(info.lawDaySign) : "")}
            {infoRow("Ngày hiệu lực:", info?.lawDayActive ? fmtDate(info.lawDayActive) : "")}
            {infoRow("Số văn bản:", info?.lawNumber)}
            {infoRow("Loại VB:", info?.lawKind)}
            {infoRow("Người ký:", info?.nameSign)}
            {infoRow("Chức vụ ký:", info?.roleSign)}
            {infoRow("Cơ quan ban hành:", info?.unitPublish)}
            {info?.lawRelated &&
              infoRow(
                "Luật liên quan:",
                Object.entries(info.lawRelated).map(([k, v]) => `${k} — ${v}`),
              )}
          </View>
        )}

        <TouchableOpacity onPress={() => setShowRaw((s) => !s)}>
          <Text style={styles.rawToggle}>{showRaw ? "▼ Ẩn JSON thô" : "▶ Xem JSON thô (data)"}</Text>
        </TouchableOpacity>
        {showRaw && (
          <Text style={styles.raw}>{JSON.stringify(content, null, 2).slice(0, 8000)}</Text>
        )}

        <View style={styles.divider} />
        {list.length === 0 ? (
          <Text style={styles.empty}>content rỗng — parsing có thể sai format!</Text>
        ) : (
          list.map(renderTop)
        )}
        <View style={{ height: 30 }} />
      </ScrollView>

      <TouchableOpacity
        style={[styles.pushBtn, pushing && { opacity: 0.5 }]}
        onPress={onPush}
        disabled={pushing}
      >
        <Text style={styles.pushText}>
          {pushing ? "Đang push..." : exists ? "Push (ghi đè)" : "Push (Firestore + Mongo)"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "green",
    paddingHorizontal: 14,
    height: 48,
  },
  back: { color: "#fff", fontSize: 15 },
  topTitle: { color: "#fff", fontWeight: "600", fontSize: 15 },
  toggle: { color: "#fff", fontSize: 14 },
  dupWarn: { backgroundColor: "#FFF3CD", color: "#8A6D00", padding: 8, fontSize: 13 },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#000",
    textAlign: "center",
    marginBottom: 12,
  },
  infoBox: {
    backgroundColor: "#EEEFE4",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  infoHeader: { fontWeight: "bold", textAlign: "center", marginBottom: 8, color: "#000" },
  infoRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    paddingVertical: 6,
  },
  infoLabel: { width: "38%", fontWeight: "600", color: "#333", fontSize: 13 },
  infoValue: { color: "#000", fontSize: 13, textAlign: "justify" },
  rawToggle: { color: "#1565C0", marginBottom: 6 },
  raw: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#333",
    backgroundColor: "#f4f4f4",
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  divider: { height: 1, backgroundColor: "#ddd", marginVertical: 8 },
  chapter: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#000",
    textAlign: "center",
    padding: 8,
    backgroundColor: "#e8f0fe",
    marginVertical: 4,
  },
  subChapter: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    padding: 4,
    backgroundColor: "#66CCFF",
    marginVertical: 2,
  },
  article: { paddingVertical: 6 },
  dieu: { fontWeight: "bold", color: "#000", fontSize: 15, marginBottom: 2 },
  line: { color: "#111", fontSize: 14, lineHeight: 21, textAlign: "justify" },
  empty: { color: "#C62828", textAlign: "center", marginTop: 20 },
  pushBtn: { backgroundColor: "#C62828", padding: 14, alignItems: "center" },
  pushText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
