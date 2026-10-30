/**
 * Verified manufacturer attribution.
 * A winning SI/reseller must never be treated as the virtualization manufacturer.
 * Vendor amounts are whole-project awards, not product-only revenue.
 */
export const VENDORS = [
  { id: "오케스트로", label: "오케스트로", products: "CONTRABASS · VIOLA" },
  { id: "에이블클라우드", label: "에이블클라우드", products: "ABLESTACK" },
  { id: "Nutanix", label: "Nutanix", products: "AHV · NCI" },
  { id: "VMware", label: "VMware", products: "vSphere · VCF" },
  { id: "이노그리드", label: "이노그리드", products: "CloudIT · OpenStackit" },
  { id: "Red Hat", label: "Red Hat", products: "OpenShift Virtualization" },
  { id: "Proxmox", label: "Proxmox", products: "Proxmox VE" },
  { id: "파이오링크", label: "파이오링크", products: "POPCON HCI" },
  { id: "도시엔컴", label: "도시엔컴", products: "씨티클라우드" },
  { id: "SmartX", label: "SmartX", products: "SmartX HCI" },
  { id: "더조인", label: "더조인", products: "J-Virtual Mobile" },
  { id: "이트론", label: "이트론", products: "JDesktop" },
  { id: "인콤", label: "인콤", products: "JDesktop" },
] as const;

export type VendorId = (typeof VENDORS)[number]["id"];
export type Attribution = {vendor: VendorId; evidence: "공고명 제품 명시" | "제조사 공식 구축사례" | "제조사 직접 낙찰" | "쇼핑몰 품목명"; url?: string};

type AwardLike = {
  bid_no?: string | null; project?: string | null; product_brand?: string | null;
  winner_name?: string | null; winner_business_no?: string | null;
};
type DeliveryLike = {product_name?:string|null; brand?:string|null; supplier_name?:string|null; product_id?:string|null};

const CONFIRMED_CASES: Record<string,{vendor:VendorId;url:string}> = {
  "R26BK01375930": {vendor:"에이블클라우드",url:"https://ablecloud.io/resource/blog/45"},
  "R26BK01269547": {vendor:"에이블클라우드",url:"https://ablecloud.io/resource/blog/47"},
};
const VENDOR_BIZNOS: Record<string, VendorId> = {
  "6748801017": "오케스트로",
  "8868602158": "에이블클라우드",
  "2208736743": "이노그리드",
};
export function vendorFromProduct(text: string): VendorId | null {
  // Match actual brand/product names only. 'HCI', 'KVM', 'OpenStack', '가상화' alone
  // do not identify a manufacturer and must not contribute to its sales totals.
  if (/에이블클라우드|ablecloud|ablestack|abelstack|에이블스택/i.test(text)) return "에이블클라우드";
  if (/오케스트로|okestro|contrabass|콘트라베이스|콘트라바스|(?:^|\W)viola(?:$|\W)|비올라/i.test(text)) return "오케스트로";
  if (/nutanix|뉴타닉스|acropolis/i.test(text) ||
      (/\bAHV\b/i.test(text) && /가상화|하이퍼바이저|hci|클라우드|virtualization/i.test(text))) return "Nutanix";
  if (/vmware|vcenter|vsphere|esxi|\bVCF\b|\bvSAN\b|브이엠웨어/i.test(text)) return "VMware";
  if (/이노그리드|innogrid|openstackit|오픈스택잇|클라우드잇|cloud.?it/i.test(text)) return "이노그리드";
  if (/red\s*hat.{0,20}(?:virtualization|openshift)|openshift.{0,16}virtualization|레드햇.{0,12}가상화/i.test(text)) return "Red Hat";
  if (/proxmox|프록스목스/i.test(text)) return "Proxmox";
  if (/popcon\s*hci|파이오링크.{0,30}(hci|가상화)/i.test(text)) return "파이오링크";
  if (/dstation|디스테이션|틸론.{0,25}(가상화|vdi)/i.test(text)) return "틸론";
  if (/씨티클라우드|citycloud|도시엔컴.{0,25}(가상화|hci)/i.test(text)) return "도시엔컴";
  if (/smartx.{0,35}(가상화|hci|분산스토리지)|\bsmartx\b/i.test(text)) return "SmartX";
  if (/j-virtual mobile|더조인.{0,30}가상화/i.test(text)) return "더조인";
  if (/이트론.{0,60}jdesktop/i.test(text)) return "이트론";
  if (/인콤.{0,60}jdesktop/i.test(text)) return "인콤";
  return null;
}
export function vendorFromAward(row: AwardLike): Attribution | null {
  // The product/brand is explicitly in the tender name: strong evidence.
  const named = vendorFromProduct(row.project ?? "") || vendorFromProduct(row.product_brand ?? "");
  if (named) return {vendor:named,evidence:"공고명 제품 명시"};
  const verified = CONFIRMED_CASES[String(row.bid_no??"")];
  if (verified) return {vendor:verified.vendor,evidence:"제조사 공식 구축사례",url:verified.url};
  // A manufacturer may itself win a virtualization tender without specifying product.
  const bizno = String(row.winner_business_no??"").replace(/\D/g,"");
  if (bizno && VENDOR_BIZNOS[bizno]) return {vendor:VENDOR_BIZNOS[bizno],evidence:"제조사 직접 낙찰"};
  return null;
}
/** Filter competitive cloud/virtualization purchases without deleting source records. */
export function isCompetitiveDeliveryProduct(productName: string): boolean {
  const category=(productName.split(",")[0]??"").replace(/\s+/g,"");
  if(category==="보안소프트웨어"||category==="통신소프트웨어") return false;
  if(category==="유틸리티소프트웨어") return true;
  if(category==="운영체제"||category==="시스템관리소프트웨어")
    return /가상화|클라우드|\bHCI\b|virtuali[sz]|\bcloud\b|분산스토리지|Cloud&/i.test(productName);
  return false;
}
export function vendorFromDelivery(row: DeliveryLike): Attribution | null {
  const named = vendorFromProduct([row.product_name??"",row.brand??""].join(" "));
  return named ? {vendor:named,evidence:"쇼핑몰 품목명"} : null;
}
export type ProductCategory = "server_virtualization" | "hci" | "vdi" | "virtualization_other";

/** Deterministic product-title classification for the shared year/vendor/category filters. */
export function classifyDeliveryProduct(title: string): ProductCategory {
  if (/dstation|디스테이션|jdesktop|j-virtual|virtual mobile|\bvdi\b|daasxpert|데스크[톱탑]|nepyx|netdesktop|v-spacer|vd-i/i.test(title)) return "vdi";
  if (/\bhci\b|하이퍼컨버|popcon|smartx|able\s*stack\s*v4|ablestack\s*v4|에이블스택\s*v4/i.test(title)) return "hci";
  if (/contrabass|콘트라베이스|openstackit|cloudit|클라우드잇|nutanix|뉴타닉스|vmware|vsphere|vcenter|esxi|씨티클라우드|proxmox|가상화지원운영체제|서버.?가상화/i.test(title)) return "server_virtualization";
  return "virtualization_other";
}
export function vendorLabel(id: VendorId): string {
  return VENDORS.find(v=>v.id===id)?.label??id;
}
