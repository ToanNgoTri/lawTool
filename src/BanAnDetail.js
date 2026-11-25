/**
 * Chi tiết 1 bản án (src/banAnNguon.js) + XEM PDF NGAY TRONG APP (react-native-pdf).
 * File PDF tải thẳng từ toaan.gov.vn (network_security_config bù chứng chỉ trung gian còn thiếu),
 * lưu cache theo id nên mở lại không tải lại.
 */
import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Linking, Share, StyleSheet } from "react-native";
import Pdf from "react-native-pdf";
import { banAnChiTiet } from "./banAnNguon";

function Dong({ nhan, giaTri }) {
  if (!giaTri) return null;
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{nhan}</Text>
      <Text style={styles.lineValue} selectable>
        {giaTri}
      </Text>
    </View>
  );
}

// tomTat: mục từ danh sách kết quả -> hiện ngay trong lúc tải chi tiết
export default function BanAnDetail({ tomTat, onBack }) {
  const [ct, setCt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [moThongTin, setMoThongTin] = useState(false);
  const [pdf, setPdf] = useState({ phanTram: 0, trang: 1, soTrang: 0, loi: "", lan: 0 });

  async function tai() {
    setLoading(true);
    setError("");
    try {
      setCt(await banAnChiTiet(tomTat.id));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    tai();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tomTat.id]);

  const d = { ...tomTat, ...(ct || {}) };
  const url = d.url || `https://congbobanan.toaan.gov.vn/2ta${d.id}t1cvn/chi-tiet-ban-an`;
  const tieuDe = `${d.loaiVanBan || "Bản án"} số ${d.so} ngày ${d.ngay}`;
  const taiLaiPdf = () => setPdf((o) => ({ phanTram: 0, trang: 1, soTrang: 0, loi: "", lan: o.lan + 1 }));

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>← Kết quả</Text>
        </TouchableOpacity>
        <View style={styles.topActions}>
          <TouchableOpacity
            hitSlop={10}
            onPress={() => Share.share({ message: `${tieuDe} của ${d.toaAn}\n${d.ten}\n${url}` })}
          >
            <Text style={styles.link}>↗ Chia sẻ</Text>
          </TouchableOpacity>
          <TouchableOpacity hitSlop={10} onPress={() => Linking.openURL(url)}>
            <Text style={styles.link}>🌐 Web</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Thông tin: gọn 3 dòng, chạm để mở rộng */}
      <TouchableOpacity activeOpacity={0.8} onPress={() => setMoThongTin((v) => !v)} style={styles.head}>
        <Text style={styles.title} selectable>
          {tieuDe}
        </Text>
        <Text style={styles.court} numberOfLines={moThongTin ? undefined : 1}>
          {d.toaAn}
        </Text>
        <Text style={styles.name} numberOfLines={moThongTin ? undefined : 2}>
          {d.ten}
        </Text>
        {moThongTin && (
          <ScrollView style={styles.box} nestedScrollEnabled>
            <Dong nhan="Cấp xét xử" giaTri={d.capXetXu} />
            <Dong nhan="Loại án" giaTri={d.loaiAn} />
            <Dong nhan="Áp dụng án lệ" giaTri={d.apDungAnLe} />
            <Dong nhan="Đính chính" giaTri={d.dinhChinh} />
            <Dong nhan="Ngày công bố" giaTri={d.ngayCongBo} />
            <Dong nhan="Thông tin vụ án" giaTri={d.thongTin} />
          </ScrollView>
        )}
        <Text style={styles.more}>{moThongTin ? "▲ Thu gọn" : "▼ Thông tin vụ án"}</Text>
      </TouchableOpacity>

      {/* PDF */}
      <View style={styles.pdfWrap}>
        {loading && <ActivityIndicator color="#4CAF50" style={styles.center} />}
        {!!error && (
          <TouchableOpacity onPress={tai} style={styles.center}>
            <Text style={styles.error}>Lỗi: {error}</Text>
            <Text style={styles.link}>↻ Thử lại</Text>
          </TouchableOpacity>
        )}
        {ct && !ct.pdfGoc && <Text style={[styles.sub, styles.center]}>Bản án này chưa có file PDF.</Text>}
        {ct?.pdfGoc && !pdf.loi && (
          <Pdf
            key={pdf.lan}
            source={{ uri: ct.pdfGoc, cache: true, cacheFileName: `banan_${ct.id}` }}
            style={styles.pdf}
            // Mặc định true -> blob-util tự dựng trust manager kiểu cũ, OkHttp mới ném
            // "Use of own trust manager but none defined". Dùng trust manager hệ thống
            // (đã có chứng chỉ GlobalSign trung gian qua network_security_config).
            trustAllCerts={false}
            fitPolicy={0} // vừa chiều ngang màn hình
            spacing={6}
            enableAntialiasing
            renderActivityIndicator={() => (
              <View style={styles.center}>
                <ActivityIndicator color="#4CAF50" />
                <Text style={styles.sub}>
                  Đang tải bản án{pdf.phanTram > 0 ? ` ${Math.round(pdf.phanTram * 100)}%` : "…"}
                </Text>
              </View>
            )}
            onLoadProgress={(p) => setPdf((o) => ({ ...o, phanTram: p }))}
            onLoadComplete={(soTrang) => setPdf((o) => ({ ...o, soTrang }))}
            onPageChanged={(trang, soTrang) => setPdf((o) => ({ ...o, trang, soTrang }))}
            onError={(e) => setPdf((o) => ({ ...o, loi: String(e?.message || e) }))}
          />
        )}
        {!!pdf.loi && (
          <View style={styles.center}>
            <Text style={styles.error}>Không mở được PDF: {pdf.loi}</Text>
            <TouchableOpacity onPress={taiLaiPdf}>
              <Text style={styles.link}>↻ Thử lại</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL(ct.pdfGoc)}>
              <Text style={styles.link}>Mở bằng trình duyệt</Text>
            </TouchableOpacity>
          </View>
        )}
        {pdf.soTrang > 0 && (
          <View style={styles.pageBadge} pointerEvents="none">
            <Text style={styles.pageText}>
              {pdf.trang}/{pdf.soTrang}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141414" },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  topActions: { flexDirection: "row", gap: 18 },
  back: { color: "#4CAF50", fontSize: 15 },
  link: { color: "#FF9800", fontSize: 14, textAlign: "center", marginTop: 6 },
  head: { paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#2c2c2c" },
  title: { color: "#90CAF9", fontSize: 16, fontWeight: "600" },
  court: { color: "#bbb", fontSize: 13, marginTop: 2 },
  name: { color: "#eee", fontSize: 14, marginTop: 6, lineHeight: 19 },
  more: { color: "#777", fontSize: 12, marginTop: 6 },
  box: { maxHeight: 220, marginTop: 8 },
  line: { flexDirection: "row", gap: 10, marginBottom: 6 },
  lineLabel: { color: "#888", fontSize: 13, width: 110 },
  lineValue: { color: "#ddd", fontSize: 13, flex: 1 },
  pdfWrap: { flex: 1, backgroundColor: "#2a2a2a" },
  pdf: { flex: 1, backgroundColor: "#2a2a2a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  error: { color: "#ff6b6b", textAlign: "center" },
  sub: { color: "#999", fontSize: 13, marginTop: 8, textAlign: "center" },
  pageBadge: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pageText: { color: "#fff", fontSize: 12 },
});
