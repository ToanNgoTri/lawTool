/**
 * lawRNTool — công cụ lấy văn bản luật (luatvietnam.vn) và push lên Mongo + Firestore.
 * Backend: Firebase Functions (functions/index.js).
 */

import { useState, useEffect, useRef } from "react";
import { StatusBar, StyleSheet, BackHandler, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import CheckScreen from "./src/CheckScreen";
import LawScreen from "./src/LawScreen";
import AppConfigScreen from "./src/AppConfigScreen";
import { load, save } from "./src/session";

function App() {
  // nhớ văn bản đang mở: app bị Android tắt khi chạy nền thì mở lại đúng màn đó
  const [lawUrl, setLawUrl] = useState(() => load("openLaw"));
  const [showConfig, setShowConfig] = useState(false);
  const checkRef = useRef(null);

  useEffect(() => {
    save("openLaw", lawUrl);
  }, [lawUrl]);

  // Nút back cứng (Android): đang ở màn luật -> quay về danh sách (giữ nguyên
  // data danh sách vì CheckScreen không bị unmount). Ở danh sách -> thoát app.
  useEffect(() => {
    const onBack = () => {
      if (showConfig) {
        setShowConfig(false);
        return true;
      }
      if (lawUrl) {
        setLawUrl(null);
        return true; // đã xử lý -> không thoát app
      }
      return false; // ở danh sách -> để hệ thống xử lý (thoát)
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [lawUrl, showConfig]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#141414" />
      <View style={styles.container}>
        {/* CheckScreen LUÔN mounted -> giữ nguyên danh sách đã lấy khi back về */}
        <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
          <CheckScreen
            ref={checkRef}
            onOpenLaw={(url) => setLawUrl(url)}
            onOpenConfig={() => setShowConfig(true)}
          />
        </SafeAreaView>

        {/* LawScreen phủ lên trên khi mở 1 văn bản */}
        {lawUrl && (
          <SafeAreaView
            style={[StyleSheet.absoluteFill, styles.container]}
            edges={["top", "left", "right"]}
          >
            <LawScreen
              key={lawUrl}
              url={lawUrl}
              onBack={() => setLawUrl(null)}
              onPushed={(url) => checkRef.current?.removeByHref(url)}
            />
          </SafeAreaView>
        )}

        {/* AppConfigScreen: sửa LawMachine.AppConfig trên Mongo */}
        {showConfig && (
          <SafeAreaView
            style={[StyleSheet.absoluteFill, styles.container]}
            edges={["top", "left", "right"]}
          >
            <AppConfigScreen onBack={() => setShowConfig(false)} />
          </SafeAreaView>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141414" },
});

export default App;
