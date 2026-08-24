// 差異化分群邏輯
// 輸入: students (含 id, name, seat_no), scoresByStudent (student_id -> [{exam_order, subject, score}])
// 依三種模式把學生分成 高分群 / 中分群 / 待加強

export const CORE_SUBJECTS = ["國文", "英文", "數學", "社會", "自然"];
export const TIER_LABELS = { high: "高分群", mid: "中分群", low: "待加強" };
export const TIER_COLOR = {
  high: "#3F7D58",
  mid: "#C99A3A",
  low: "#C0392B",
};

function tertileSplit(items, valueFn) {
  // items: array of anything; valueFn: item -> number|null
  const withVal = items
    .map((it) => ({ it, v: valueFn(it) }))
    .filter((x) => x.v !== null && x.v !== undefined && !Number.isNaN(x.v));
  const sorted = [...withVal].sort((a, b) => b.v - a.v);
  const n = sorted.length;
  const result = new Map();
  sorted.forEach((row, idx) => {
    let tier;
    if (idx < Math.ceil(n / 3)) tier = "high";
    else if (idx < Math.ceil((2 * n) / 3)) tier = "mid";
    else tier = "low";
    result.set(row.it, tier);
  });
  // students with no data at all -> no tier
  return result;
}

// 最近一次段考「平均」分群
export function groupByLatestAverage(students, scoresByStudent) {
  return tertileSplit(students, (s) => {
    const rows = (scoresByStudent[s.id] || []).filter((r) => r.subject === "平均");
    if (rows.length === 0) return null;
    const latest = rows.reduce((a, b) => (a.exam_order > b.exam_order ? a : b));
    return latest.score;
  });
}

// 依單一科目、最近一次分數分群
export function groupBySubject(students, scoresByStudent, subject) {
  return tertileSplit(students, (s) => {
    const rows = (scoresByStudent[s.id] || []).filter((r) => r.subject === subject);
    if (rows.length === 0) return null;
    const latest = rows.reduce((a, b) => (a.exam_order > b.exam_order ? a : b));
    return latest.score;
  });
}

// 趨勢分群:用最近 N 次「平均」成績做簡單線性迴歸,依斜率分「進步 / 持平 / 退步」
export function groupByTrend(students, scoresByStudent, windowSize = 5) {
  const trendOf = (s) => {
    const rows = (scoresByStudent[s.id] || [])
      .filter((r) => r.subject === "平均")
      .sort((a, b) => a.exam_order - b.exam_order);
    const recent = rows.slice(-windowSize);
    if (recent.length < 2) return null;
    const n = recent.length;
    const xs = recent.map((_, i) => i);
    const ys = recent.map((r) => r.score);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0,
      den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - xMean) * (ys[i] - yMean);
      den += (xs[i] - xMean) ** 2;
    }
    return den === 0 ? 0 : num / den; // 斜率:每次考試平均分數變化
  };

  const items = students.map((s) => ({ s, slope: trendOf(s) }));
  const result = new Map();
  items.forEach(({ s, slope }) => {
    if (slope === null) {
      return;
    }
    let tier;
    if (slope > 1.5) tier = "high"; // 進步
    else if (slope < -1.5) tier = "low"; // 退步
    else tier = "mid"; // 持平
    result.set(s, tier);
  });
  return result;
}

export const TREND_LABELS = { high: "進步中", mid: "持平", low: "退步中" };
