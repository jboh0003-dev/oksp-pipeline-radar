/**
 * 나라장터 사전규격정보서비스 — /ao/ 경로 (입찰은 /ad/) 가 정답.
 * 공공데이터포털 ID 15129437 / Service: HrcspSsstndrdInfoService
 * Operation: getPublicPrcureThngInfoServcPPSSrch (용역), getPublicPrcureThngInfoThng (물품) 등
 */
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const serviceKey = env.G2B_SERVICE_KEY;

function yyyymmddhhmm(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}0000`;
}
const end = new Date();
const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
const inqryBgnDt = yyyymmddhhmm(start);
const inqryEndDt = yyyymmddhhmm(end);

const BASE = "http://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService";

const OPS = [
  // 검색식 PPSSrch — 용역/물품/공사/외자
  "getPublicPrcureThngInfoServcPPSSrch",
  "getPublicPrcureThngInfoThngPPSSrch",
  "getPublicPrcureThngInfoCnstwkPPSSrch",
  "getPublicPrcureThngInfoFrgcptPPSSrch",
  // 단순 list 형
  "getPublicPrcureThngInfoServc",
  "getPublicPrcureThngInfoThng",
  "getPublicPrcureThngInfoCnstwk",
  "getPublicPrcureThngInfoFrgcpt",
];

async function tryOne(op) {
  const u = new URL(`${BASE}/${op}`);
  u.searchParams.set("serviceKey", serviceKey);
  u.searchParams.set("pageNo", "1");
  u.searchParams.set("numOfRows", "5");
  u.searchParams.set("inqryDiv", "1");
  u.searchParams.set("inqryBgnDt", inqryBgnDt);
  u.searchParams.set("inqryEndDt", inqryEndDt);
  u.searchParams.set("type", "json");
  const res = await fetch(u.toString());
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // ignore
  }
  return { op, status: res.status, parsed, preview: text.slice(0, 500) };
}

(async () => {
  console.log(`inqry: ${inqryBgnDt} ~ ${inqryEndDt}`);
  for (const op of OPS) {
    const r = await tryOne(op);
    console.log("=================================");
    console.log(op);
    console.log("HTTP:", r.status);
    if (r.parsed) {
      const root = r.parsed;
      const response = root.response ?? root;
      const header = response?.header;
      const body = response?.body;
      console.log("header:", JSON.stringify(header));
      console.log("totalCount:", body?.totalCount, "pageNo:", body?.pageNo, "numOfRows:", body?.numOfRows);
      const items = body?.items;
      if (items) {
        let arr = [];
        if (Array.isArray(items)) arr = items;
        else if (typeof items === "object") {
          const inner = items.item;
          arr = Array.isArray(inner) ? inner : inner ? [inner] : [];
        }
        console.log("items.length:", arr.length);
        if (arr.length > 0) {
          console.log("first keys:", Object.keys(arr[0]).join(", "));
          console.log("--- first item ---");
          console.log(JSON.stringify(arr[0], null, 2));
        }
      }
    } else {
      console.log("preview:", r.preview);
    }
  }
})();
