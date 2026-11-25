/**
 * Tra cứu bản án công bố trên congbobanan.toaan.gov.vn theo tội danh
 * Điện thoại tự đọc trang (src/banAnNguon.js) — máy chủ tòa án chặn IP Firebase/Google Cloud.
 * Bộ lọc + kết quả trang đầu lưu xuống máy (session "banAn").
 */
import { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { banAnDanhMuc, banAnToiDanh, banAnToaAn, banAnTim } from "./banAnNguon";
import { load, save } from "./session";

// bỏ dấu tiếng Việt để tìm "trom cap" ra "Trộm cắp"
export function khongDau(s) {
  let t = String(s || "").toLowerCase();
  try {
    t = t.normalize("NFD").replace(/[̀-ͯ]/g, "");
  } catch {}
  return t.replace(/đ/g, "d");
}

// "Luật sửa đổi, bổ sung một số điều của BLHS năm 2015" -> "BLHS 2015 (sửa đổi 2017)"
export function gonBoLuat(b) {
  if (!b) return "";
  if (/sửa đổi/i.test(b) && /2015/.test(b)) return "BLHS 2015 (sửa đổi 2017)";
  const m = b.match(/^Bộ luật hình sự năm (\d{4})$/i);
  return m ? `BLHS ${m[1]}` : b;
}
const hangBoLuat = (b) => (/sửa đổi/i.test(b) ? 0 : /2015/.test(b) ? 1 : /1999/.test(b) ? 2 : 3);

const NGAY = /^\d{2}\/\d{2}\/\d{4}$/;

// Ô chọn mở danh sách có ô tìm (dùng cho tội danh và tòa án — vài trăm đến hơn nghìn mục).
function ChonDanhSach({ visible, title, items, loading, error, onRetry, onPick, onClose, render, keyOf, textOf }) {
  const [q, setQ] = useState("");
  const loc = useMemo(() => {
    const k = khongDau(q).trim();
    if (!k) return items;
    const tu = k.split(/\s+/);
    return items.filter((it) => {
      const s = khongDau(textOf(it));
      return tu.every((w) => s.includes(w));
    });
  }, [q, items, textOf]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.back}>✕ Đóng</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={() => onPick(null)}>
            <Text style={styles.reload}>Bỏ chọn</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          placeholder="Gõ để lọc (không dấu cũng được), số điều..."
          placeholderTextColor="#666"
          autoCorrect={false}
          autoFocus
        />
        {loading && <ActivityIndicator color="#4CAF50" style={{ margin: 12 }} />}
        {!!error && (
          <TouchableOpacity onPress={onRetry}>
            <Text style={styles.error}>Lỗi: {error} — chạm để thử lại</Text>
          </TouchableOpacity>
        )}
        <FlatList
          data={loc}
          keyExtractor={keyOf}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={30}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.option} onPress={() => onPick(item)}>
              {render(item)}
            </TouchableOpacity>
          )}
          ListEmptyComponent={!loading && !error ? <Text style={styles.empty}>Không có mục nào khớp.</Text> : null}
        />
      </SafeAreaView>
    </Modal>
  );
}

function Chips({ items, value, onChange, allLabel = "Tất cả" }) {
  const all = allLabel ? [{ id: "", ten: allLabel }, ...items] : items;
  return (
    <View style={styles.chips}>
      {all.map((it) => (
        <TouchableOpacity
          key={it.id || "_"}
          style={[styles.chip, value === it.id && styles.chipOn]}
          onPress={() => onChange(it.id)}
        >
          <Text style={[styles.chipText, value === it.id && styles.chipTextOn]}>{it.ten}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const LOC_MAC_DINH = {
  loai: "50",
  toiDanh: null, // {id, dieu, ten, boLuat}
  tuKhoa: "",
  loaiVanBan: "",
  capToa: "",
  toaAn: null, // {id, ten}
  capXetXu: "",
  tuNgay: "",
  denNgay: "",
};

export default function BanAnScreen({ onBack, onOpen }) {
  const [saved] = useState(() => load("banAn") || {});
  const [loc, setLoc] = useState({ ...LOC_MAC_DINH, ...(saved.loc || {}) });
  const [danhMuc, setDanhMuc] = useState(null);
  const [toiDanh, setToiDanh] = useState({ loai: null, items: [], loading: false, error: "" });
  const [toa, setToa] = useState({ capToa: null, toaAn: [], capXetXu: [], loading: false, error: "" });
  const [chon, setChon] = useState(null); // "toiDanh" | "toaAn"
  const [kq, setKq] = useState(saved.kq || null); // {tong, soTrang, trang, ketQua, loc}
  const [dangTim, setDangTim] = useState(false);
  const [dangThem, setDangThem] = useState(false);
  const [error, setError] = useState("");
  const [moLoc, setMoLoc] = useState(!saved.kq);
  const listRef = useRef(null);

  const doi = (k, v) => setLoc((o) => ({ ...o, [k]: v }));

  useEffect(() => {
    banAnDanhMuc()
      .then(setDanhMuc)
      .catch((e) => setError(e.message || String(e)));
  }, []);

  async function taiToiDanh(loai) {
    setToiDanh({ loai, items: [], loading: true, error: "" });
    try {
      const items = await banAnToiDanh(loai);
      if (loai === "50") {
        items.sort(
          (a, b) =>
            hangBoLuat(a.boLuat) - hangBoLuat(b.boLuat) || (parseInt(a.dieu, 10) || 0) - (parseInt(b.dieu, 10) || 0),
        );
      }
      setToiDanh({ loai, items, loading: false, error: "" });
    } catch (e) {
      setToiDanh({ loai, items: [], loading: false, error: e.message || String(e) });
    }
  }

  async function taiToa(capToa) {
    if (!capToa) return setToa({ capToa: "", toaAn: [], capXetXu: [], loading: false, error: "" });
    setToa({ capToa, toaAn: [], capXetXu: [], loading: true, error: "" });
    try {
      const r = await banAnToaAn(capToa);
      setToa({ capToa, ...r, loading: false, error: "" });
    } catch (e) {
      setToa({ capToa, toaAn: [], capXetXu: [], loading: false, error: e.message || String(e) });
    }
  }

  useEffect(() => {
    if (loc.loai && toiDanh.loai !== loc.loai) taiToiDanh(loc.loai);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.loai]);

  useEffect(() => {
    if (toa.capToa !== loc.capToa) taiToa(loc.capToa);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.capToa]);

  function thamSo(l, trang) {
    return {
      loai: l.loai || undefined,
      toiDanh: l.toiDanh?.id,
      tuKhoa: l.tuKhoa.trim() || undefined,
      loaiVanBan: l.loaiVanBan || undefined,
      capToa: l.capToa || undefined,
      toaAn: l.toaAn?.id,
      capXetXu: l.capXetXu || undefined,
      tuNgay: l.tuNgay.trim() || undefined,
      denNgay: l.denNgay.trim() || undefined,
      trang,
    };
  }

  async function tim() {
    for (const k of ["tuNgay", "denNgay"]) {
      if (loc[k].trim() && !NGAY.test(loc[k].trim())) {
        setError("Ngày phải dạng dd/MM/yyyy, ví dụ 01/01/2026");
        return;
      }
    }
    setDangTim(true);
    setError("");
    try {
      const r = await banAnTim(thamSo(loc, 1));
      const moi = { ...r, loc };
      setKq(moi);
      setMoLoc(false);
      save("banAn", { loc, kq: moi });
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setDangTim(false);
    }
  }

  async function taiThem() {
    if (!kq || dangThem || dangTim || kq.trang >= kq.soTrang) return;
    setDangThem(true);
    setError("");
    try {
      const r = await banAnTim(thamSo(kq.loc, kq.trang + 1));
      setKq((o) => {
        const daCo = new Set(o.ketQua.map((x) => x.id));
        return { ...o, trang: r.trang, ketQua: [...o.ketQua, ...r.ketQua.filter((x) => !daCo.has(x.id))] };
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setDangThem(false);
    }
  }

  const laHinhSu = loc.loai === "50";
  const nhanToiDanh = laHinhSu ? "Tội danh" : "Quan hệ pháp luật";
  const tomTatLoc = kq
    ? [
        kq.loc.toiDanh && `${kq.loc.toiDanh.dieu ? `Điều ${kq.loc.toiDanh.dieu} ` : ""}${kq.loc.toiDanh.ten}`,
        kq.loc.tuKhoa && `"${kq.loc.tuKhoa}"`,
        kq.loc.toaAn?.ten,
        (kq.loc.tuNgay || kq.loc.denNgay) && `${kq.loc.tuNgay || "…"} → ${kq.loc.denNgay || "…"}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const boLoc = (
    <View>
      <Text style={styles.label}>Loại vụ việc</Text>
      <Chips
        items={danhMuc?.loai || [{ id: "50", ten: "Hình sự" }]}
        value={loc.loai}
        allLabel={null}
        onChange={(v) => setLoc((o) => ({ ...o, loai: v, toiDanh: null }))}
      />

      <Text style={styles.label}>{nhanToiDanh}</Text>
      <TouchableOpacity style={styles.select} onPress={() => setChon("toiDanh")}>
        {loc.toiDanh ? (
          <View style={{ flex: 1 }}>
            <Text style={styles.selectText}>
              {loc.toiDanh.dieu ? `Điều ${loc.toiDanh.dieu}. ` : ""}
              {loc.toiDanh.ten}
            </Text>
            {!!loc.toiDanh.boLuat && <Text style={styles.selectSub}>{gonBoLuat(loc.toiDanh.boLuat)}</Text>}
          </View>
        ) : (
          <Text style={styles.placeholder}>— Tất cả — chạm để chọn</Text>
        )}
        <Text style={styles.caret}>▾</Text>
      </TouchableOpacity>

      <Text style={styles.label}>Từ khóa (tên vụ việc, số bản án)</Text>
      <TextInput
        style={styles.input}
        value={loc.tuKhoa}
        onChangeText={(v) => doi("tuKhoa", v)}
        placeholder="Không bắt buộc"
        placeholderTextColor="#666"
        returnKeyType="search"
        onSubmitEditing={tim}
      />

      <Text style={styles.label}>Loại văn bản</Text>
      <Chips items={danhMuc?.loaiVanBan || []} value={loc.loaiVanBan} onChange={(v) => doi("loaiVanBan", v)} />

      <Text style={styles.label}>Cấp tòa</Text>
      <Chips
        items={danhMuc?.capToa || []}
        value={loc.capToa}
        onChange={(v) => setLoc((o) => ({ ...o, capToa: v, toaAn: null, capXetXu: "" }))}
      />

      {!!loc.capToa && (
        <>
          <Text style={styles.label}>Tòa án</Text>
          <TouchableOpacity style={styles.select} onPress={() => setChon("toaAn")}>
            <Text style={[styles.selectText, !loc.toaAn && styles.placeholder, { flex: 1 }]}>
              {loc.toaAn ? loc.toaAn.ten : "— Tất cả tòa cấp này —"}
            </Text>
            {toa.loading ? <ActivityIndicator color="#4CAF50" /> : <Text style={styles.caret}>▾</Text>}
          </TouchableOpacity>
          {toa.capXetXu.length > 0 && (
            <>
              <Text style={styles.label}>Cấp xét xử</Text>
              <Chips items={toa.capXetXu} value={loc.capXetXu} onChange={(v) => doi("capXetXu", v)} />
            </>
          )}
        </>
      )}

      <Text style={styles.label}>Ngày bản án/quyết định</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={loc.tuNgay}
          onChangeText={(v) => doi("tuNgay", v)}
          placeholder="Từ dd/MM/yyyy"
          placeholderTextColor="#666"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={loc.denNgay}
          onChangeText={(v) => doi("denNgay", v)}
          placeholder="Đến dd/MM/yyyy"
          placeholderTextColor="#666"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
      </View>

      <View style={[styles.row, { marginTop: 12 }]}>
        <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={tim} disabled={dangTim}>
          <Text style={styles.btnText}>{dangTim ? "Đang tìm…" : "🔍 Tìm kiếm"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnGhost} onPress={() => setLoc({ ...LOC_MAC_DINH })}>
          <Text style={styles.reload}>Xóa lọc</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const header = (
    <View>
      <View style={styles.topBar}>
        {onBack ? (
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.back}>← Danh sách</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
        {!!kq && (
          <TouchableOpacity onPress={() => setMoLoc((v) => !v)}>
            <Text style={styles.reload}>{moLoc ? "▲ Thu bộ lọc" : "▼ Bộ lọc"}</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.title}>Tra cứu bản án</Text>
      <Text style={styles.sub}>Nguồn: congbobanan.toaan.gov.vn</Text>
      {moLoc && boLoc}
      {dangTim && <ActivityIndicator color="#4CAF50" style={{ margin: 12 }} />}
      {!!error && <Text style={styles.error}>Lỗi: {error}</Text>}
      {!!kq && !dangTim && (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {kq.tong.toLocaleString("vi-VN")} bản án, quyết định
            {kq.soTrang > 1 ? ` • đã tải ${kq.ketQua.length}` : ""}
          </Text>
          {!!tomTatLoc && <Text style={styles.selectSub}>{tomTatLoc}</Text>}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={dangTim ? [] : kq?.ketQua || []}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 12 }}
        onEndReached={taiThem}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => onOpen(item)}>
            <Text style={styles.cardTitle}>
              {item.loaiVanBan} số {item.so} ngày {item.ngay}
            </Text>
            <Text style={styles.cardCourt}>{item.toaAn}</Text>
            <Text style={styles.cardName} numberOfLines={3}>
              {item.ten}
            </Text>
            {!!item.thongTin && item.thongTin !== item.ten && (
              <Text style={styles.cardInfo} numberOfLines={2}>
                {item.thongTin}
              </Text>
            )}
            <Text style={styles.cardMeta}>
              {[item.capXetXu, item.loaiAn, item.apDungAnLe === "Có" && "Có áp dụng án lệ", `công bố ${item.ngayCongBo}`]
                .filter(Boolean)
                .join(" • ")}
              {`  👁 ${item.luotXem}  ⬇ ${item.luotTai}`}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          kq && !dangTim ? <Text style={styles.empty}>Không có bản án nào khớp bộ lọc.</Text> : null
        }
        ListFooterComponent={
          dangThem ? (
            <ActivityIndicator color="#4CAF50" style={{ margin: 16 }} />
          ) : kq && kq.trang < kq.soTrang && !dangTim ? (
            <TouchableOpacity onPress={taiThem}>
              <Text style={[styles.reload, { textAlign: "center", margin: 16 }]}>
                Tải thêm (trang {kq.trang + 1}/{kq.soTrang})
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ height: 40 }} />
          )
        }
      />

      <ChonDanhSach
        visible={chon === "toiDanh"}
        title={nhanToiDanh}
        items={toiDanh.items}
        loading={toiDanh.loading}
        error={toiDanh.error}
        onRetry={() => taiToiDanh(loc.loai)}
        onClose={() => setChon(null)}
        onPick={(it) => {
          doi("toiDanh", it);
          setChon(null);
        }}
        keyOf={(it) => it.id}
        textOf={(it) => `${it.dieu} ${it.ten} ${gonBoLuat(it.boLuat)}`}
        render={(it) => (
          <View>
            <Text style={styles.selectText}>
              {it.dieu ? `Điều ${it.dieu}. ` : ""}
              {it.ten}
            </Text>
            {!!it.boLuat && <Text style={styles.selectSub}>{gonBoLuat(it.boLuat)}</Text>}
          </View>
        )}
      />

      <ChonDanhSach
        visible={chon === "toaAn"}
        title="Tòa án"
        items={toa.toaAn}
        loading={toa.loading}
        error={toa.error}
        onRetry={() => taiToa(loc.capToa)}
        onClose={() => setChon(null)}
        onPick={(it) => {
          doi("toaAn", it);
          setChon(null);
        }}
        keyOf={(it) => it.id}
        textOf={(it) => it.ten}
        render={(it) => <Text style={styles.selectText}>{it.ten}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141414" },
  modal: { flex: 1, backgroundColor: "#141414", padding: 12 },
  modalTitle: { color: "#eee", fontSize: 16, fontWeight: "600" },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  back: { color: "#4CAF50", fontSize: 15 },
  reload: { color: "#FF9800", fontSize: 15 },
  title: { color: "#eee", fontSize: 18, fontWeight: "600", marginTop: 4 },
  sub: { color: "#888", fontSize: 12, marginBottom: 6 },
  label: { color: "#aaa", fontSize: 13, marginTop: 10, marginBottom: 4 },
  error: { color: "#ff6b6b", marginVertical: 6 },
  empty: { color: "#888", textAlign: "center", marginVertical: 16 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    color: "#eee",
    backgroundColor: "#1e1e1e",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 4,
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    backgroundColor: "#1e1e1e",
    padding: 10,
    gap: 8,
  },
  selectText: { color: "#eee", fontSize: 14 },
  selectSub: { color: "#90CAF9", fontSize: 12, marginTop: 2 },
  placeholder: { color: "#777", fontSize: 14, flex: 1 },
  caret: { color: "#888", fontSize: 16 },
  option: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#262626" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderColor: "#444", borderRadius: 16, paddingVertical: 5, paddingHorizontal: 12 },
  chipOn: { backgroundColor: "#1565C0", borderColor: "#1565C0" },
  chipText: { color: "#ccc", fontSize: 13 },
  chipTextOn: { color: "#fff", fontWeight: "600" },
  btn: { backgroundColor: "#1565C0", borderRadius: 8, paddingVertical: 11, alignItems: "center" },
  btnGhost: { paddingVertical: 11, paddingHorizontal: 12 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  summary: { marginTop: 12, marginBottom: 8 },
  summaryText: { color: "#4CAF50", fontSize: 14, fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    backgroundColor: "#1a1a1a",
    padding: 10,
    marginBottom: 8,
  },
  cardTitle: { color: "#90CAF9", fontSize: 14, fontWeight: "600" },
  cardCourt: { color: "#bbb", fontSize: 13, marginTop: 2 },
  cardName: { color: "#eee", fontSize: 14, marginTop: 6 },
  cardInfo: { color: "#999", fontSize: 12, marginTop: 4, fontStyle: "italic" },
  cardMeta: { color: "#777", fontSize: 11, marginTop: 6 },
});
