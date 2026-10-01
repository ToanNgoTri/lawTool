import React from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { buildTableGrid } from "./lawTables";

const MIN_COL = 44; // px tối thiểu mỗi cột
const MIN_COL_FOR_BASE = 80; // bảng nhiều cột thì cho rộng hơn màn hình + cuộn ngang
const SIDE_PADDING = 10; // khớp paddingLeft/Right của styles.lines (Detail5View)

// Vẽ 1 bảng của văn bản (rowspan/colspan, in đậm, căn lề) có cuộn ngang.
// - table: { w, rows } từ field `tables` của document; thiếu -> hiện `lines` như text cũ.
// - renderText(text, style): vẽ chữ (Detail5View truyền vào);
//   style luôn là object phẳng.
// - fontSize: cỡ chữ nội dung đang chọn (chữ trong ô nhỏ hơn 1).
export function LawTable({ table, lines, renderText, fontSize = 14 }) {
  const { width } = useWindowDimensions();

  if (!table || !Array.isArray(table.rows) || !table.rows.length) {
    return (
      <View>
        {(lines || []).map((line, i) => (
          <View key={`fl${i}`}>
            {renderText(
              line,
              StyleSheet.flatten([
                styles.fallbackLine,
                { fontSize, lineHeight: Math.round((fontSize * 23) / 14) },
              ]),
            )}
          </View>
        ))}
      </View>
    );
  }

  const cellFont = Math.max(10, fontSize - 1);
  const cellFontStyle = {
    fontSize: cellFont,
    lineHeight: Math.round(cellFont * 1.45),
  };

  const { nCols, grid } = buildTableGrid(table.rows);
  if (!nCols) return null;

  const weights =
    Array.isArray(table.w) && table.w.length === nCols
      ? table.w.map(x => (x > 0 ? x : 1))
      : new Array(nCols).fill(1);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const available = width - SIDE_PADDING * 2;
  const base = Math.max(available, nCols * MIN_COL_FOR_BASE);
  const colWidths = weights.map(x => Math.max(MIN_COL, (x / sumW) * base));
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  const tableView = (
    <View style={[styles.table, { width: tableWidth }]}>
      {grid.map((row, r) => {
        const cells = [];
        for (let c = 0; c < nCols; ) {
          const entry = row[c];
          if (!entry) {
            // hàng thiếu ô (HTML lỗi) -> ô trống
            cells.push(
              <View
                key={`e${c}`}
                style={[styles.cell, { width: colWidths[c] }]}
              />,
            );
            c++;
            continue;
          }
          let w = 0;
          for (let j = 0; j < entry.cs && c + j < nCols; j++) {
            w += colWidths[c + j];
          }
          const { cell } = entry;
          cells.push(
            <View
              key={`c${c}`}
              style={[
                styles.cell,
                { width: w },
                // ô gộp dọc: chỉ kẻ đáy ở hàng cuối cùng của ô
                !entry.isLastRow && styles.noBottom,
              ]}
            >
              {entry.isOrigin && cell.t
                ? renderText(
                    cell.t,
                    StyleSheet.flatten([
                      styles.cellText,
                      cellFontStyle,
                      cell.b ? styles.bold : null,
                      cell.a === "c"
                        ? styles.center
                        : cell.a === "r"
                        ? styles.right
                        : null,
                    ]),
                  )
                : null}
            </View>,
          );
          c += entry.cs;
        }
        return (
          <View key={`r${r}`} style={styles.row}>
            {cells}
          </View>
        );
      })}
    </View>
  );

  if (tableWidth <= available + 0.5) {
    return <View style={styles.wrap}>{tableView}</View>;
  }
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator
      style={styles.wrap}
      contentContainerStyle={styles.scrollContent}
    >
      {tableView}
    </ScrollView>
  );
}

const BORDER = "#999";

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 6,
    marginHorizontal: SIDE_PADDING,
  },
  scrollContent: {
    paddingRight: 2,
  },
  table: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: BORDER,
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  noBottom: {
    borderBottomWidth: 0,
  },
  cellText: {
    color: "black",
  },
  bold: {
    fontWeight: "bold",
  },
  center: {
    textAlign: "center",
  },
  right: {
    textAlign: "right",
  },
  fallbackLine: {
    color: "black",
    paddingHorizontal: SIDE_PADDING,
  },
});
