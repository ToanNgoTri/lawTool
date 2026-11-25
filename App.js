/**
 * lawRNTool — công cụ lấy văn bản luật (luatvietnam.vn) và push lên Mongo + Firestore,
 * kèm tra cứu bản án (congbobanan.toaan.gov.vn).
 * Backend: Firebase Functions (functions/index.js); bản án đọc thẳng trên máy (src/banAnNguon.js).
 *
 * Bố cục: thanh tab dưới (Văn bản | Bản án | Tải sẵn | Cấu hình). Các tab LUÔN mounted (ẩn bằng
 * display:none) để giữ nguyên dữ liệu khi chuyển tab. Màn văn bản (LawScreen) và chi tiết bản án
 * (BanAnDetail) phủ lên trên cả thanh tab.
 */

import { useState, useEffect, useRef } from "react";
import { StatusBar, StyleSheet, BackHandler, View, Text, TouchableOpacity } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import CheckScreen from "./src/CheckScreen";
import LawScreen from "./src/LawScreen";
import AppConfigScreen from "./src/AppConfigScreen";
import DefaultLawsScreen from "./src/DefaultLawsScreen";
import BanAnScreen from "./src/BanAnScreen";
import BanAnDetail from "./src/BanAnDetail";
import { load, save } from "./src/session";

const TABS = [
  { key: "check", icon: "📜", label: "Văn bản" },
  { key: "banAn", icon: "⚖", label: "Bản án" },
  { key: "defaultLaws", icon: "⬇", label: "Tải sẵn" },
  { key: "config", icon: "⚙", label: "Cấu hình" },
];

function TabBar({ tab, onChange }) {
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.tabBarWrap}>
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <TouchableOpacity key={t.key} style={styles.tab} onPress={() => onChange(t.key)} activeOpacity={0.7}>
              <View style={[styles.tabPill, on && styles.tabPillOn]}>
                <Text style={[styles.tabIcon, !on && styles.tabOff]}>{t.icon}</Text>
              </View>
              <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function App() {
  // nhớ văn bản đang mở + tab: app bị Android tắt khi chạy nền thì mở lại đúng màn đó
  const [lawUrl, setLawUrl] = useState(() => load("openLaw"));
  const [tab, setTab] = useState(() => (TABS.some((t) => t.key === load("tab")) ? load("tab") : "check"));
  const [banAn, setBanAn] = useState(null); // bản án đang xem chi tiết
  // tab chỉ được dựng lần đầu khi mở tới (đỡ gọi mạng lúc khởi động), sau đó giữ mounted
  const [daMo, setDaMo] = useState(() => new Set([tab]));
  const checkRef = useRef(null);

  useEffect(() => {
    save("openLaw", lawUrl);
  }, [lawUrl]);

  useEffect(() => {
    save("tab", tab);
    setDaMo((s) => (s.has(tab) ? s : new Set([...s, tab])));
  }, [tab]);

  // Nút back cứng (Android): đóng màn phủ -> về tab Văn bản -> thoát app.
  useEffect(() => {
    const onBack = () => {
      if (banAn) {
        setBanAn(null);
        return true;
      }
      if (lawUrl) {
        setLawUrl(null);
        return true;
      }
      if (tab !== "check") {
        setTab("check");
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [lawUrl, banAn, tab]);

  const trang = (key, node) =>
    daMo.has(key) && (
      <View key={key} style={[styles.container, tab !== key && styles.hidden]}>
        {node}
      </View>
    );

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#141414" />
      <View style={styles.container}>
        <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
          {trang("check", <CheckScreen ref={checkRef} onOpenLaw={(url) => setLawUrl(url)} />)}
          {trang("banAn", <BanAnScreen onOpen={(it) => setBanAn(it)} />)}
          {trang("defaultLaws", <DefaultLawsScreen />)}
          {trang("config", <AppConfigScreen />)}
        </SafeAreaView>
        <TabBar tab={tab} onChange={setTab} />

        {/* LawScreen phủ lên trên khi mở 1 văn bản */}
        {lawUrl && (
          <SafeAreaView style={[StyleSheet.absoluteFill, styles.container]} edges={["top", "left", "right", "bottom"]}>
            <LawScreen
              key={lawUrl}
              url={lawUrl}
              onBack={() => setLawUrl(null)}
              onPushed={(url) => checkRef.current?.removeByHref(url)}
            />
          </SafeAreaView>
        )}

        {/* Chi tiết bản án + xem PDF ngay trong app */}
        {banAn && (
          <SafeAreaView style={[StyleSheet.absoluteFill, styles.container]} edges={["top", "left", "right", "bottom"]}>
            <BanAnDetail key={banAn.id} tomTat={banAn} onBack={() => setBanAn(null)} />
          </SafeAreaView>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141414" },
  hidden: { display: "none" },
  tabBarWrap: { backgroundColor: "#1b1b1b", borderTopWidth: 1, borderTopColor: "#2c2c2c" },
  tabBar: { flexDirection: "row", paddingTop: 6, paddingBottom: 4 },
  tab: { flex: 1, alignItems: "center" },
  tabPill: { paddingHorizontal: 18, paddingVertical: 3, borderRadius: 14 },
  tabPillOn: { backgroundColor: "#1565C0" },
  tabIcon: { fontSize: 18, color: "#fff" },
  tabOff: { opacity: 0.55 },
  tabLabel: { fontSize: 11, color: "#888", marginTop: 2 },
  tabLabelOn: { color: "#fff", fontWeight: "600" },
});

export default App;
