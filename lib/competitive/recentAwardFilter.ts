/** Strict title evidence for the recent-winners view. A winner is an SI, not a proven manufacturer. */
export type RecentAward = {
  external_key: string; bid_no: string; bid_ord: string | null; award_date: string;
  winner_name: string; winner_business_no: string; project: string; customer: string;
  amount: number; category: string; classification: string; product_brand: string | null;
  matched_keywords: string[];
};
const relevant = /가상화|하이퍼바이저|\bhci\b|하이퍼.?컨버|contrabass|콘트라베이스|\bviola\b|비올라|ablestack|에이블스택|openstackit|클라우드잇|vmware|vsphere|vsan|esxi|nutanix|뉴타닉스|\bahv\b|proxmox|프록스목스|openshift.{0,16}virtualization/i;
const exclude = /가상\s*화폐|암호화폐|블록체인|가상화.{0,12}(스위치|방화벽|nic|네트워크카드|gpu\s*카드|모델링|시뮬레이션)|(?:스위치|방화벽|nic|네트워크카드|gpu\s*카드).{0,12}(?:가상화|\bhci\b)|\bhci\b.{0,20}(?:박스용|nic|이더넷)|(?:박스용|nic|이더넷).{0,20}\bhci\b|가상화.{0,12}(?:데스크톱|vdi)|(?:데스크톱|vdi).{0,12}가상화|가상화.{0,12}(?:오라클\s*리눅스|운영\s*sw\s*\(오라클)/i;
const peripheral = /데스크[톱탑]|desktop|\bvdi\b|\bdaas\b|gpu\s*가상화|가상화\s*gpu|\bhci\b.{0,24}(?:박스|백업시스템|디스크\s*증설|memory|hdd\s*upgrade)|(?:가상화\s*(?:서버|시스템)|가상화서버).{0,12}(?:용\s*스토리지|스토리지\s*(?:구매|증설))/i;
const catalog = /제\s*3자\s*단가|3자단가|디지털서비스.{0,8}등록|상용\s*sw.{0,8}단가/i;

export function isRecentAward(row: {
  award_date?: string | null; winner_name?: string | null; winner_business_no?: string | null;
  project?: string | null; customer?: string | null; amount?: string | number | null;
  classification?: string | null;
}, today: string): boolean {
  const title = String(row.project ?? "").trim();
  const amount = Number(row.amount);
  return !!row.award_date && row.award_date <= today && /^\d{4}-\d{2}-\d{2}$/.test(row.award_date)
    && !!row.winner_name?.trim() && /^\d{10}$/.test(String(row.winner_business_no ?? ""))
    && !!row.customer?.trim() && row.customer !== "각 수요기관"
    && Number.isSafeInteger(amount) && amount > 0 && !!title
    && (row.classification === "server_virtualization" || row.classification === "hci")
    && relevant.test(title) && !exclude.test(title) && !peripheral.test(title) && !catalog.test(title);
}
