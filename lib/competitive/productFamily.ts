/** Product evidence only. A winning company's identity cannot establish the product family. */
export type ProductFamily = "통합" | "가상화" | "PaaS";
export function productFamily(title: string): Exclude<ProductFamily, "통합"> | null {
  const paas = /se\s*cloudit|se클라우드잇|칵테일\s*클라우드|cocktail\s*cloud|\baccordion\b|아코디언|\bviola\b|비올라|\bpaas\b|k-?paas|쿠버네티스|\bkubernetes\b|\bk8s\b|오픈시프트(?!\s*가상화)|\brhocp\b|\bopenshift\b(?!\s*virtualization)|\bcloud\s*foundry\b|컨테이너\s*(?:플랫폼|서비스)|\btanzu\b/i.test(title);
  const virtualization = /contrabass|콘트라베이스|콘트라바스|가상화|virtuali[sz]ation|하이퍼바이저|hypervisor|\bhci\b|하이퍼.?컨버|ablestack|에이블스택|nutanix|뉴타닉스|\bahv\b|vsphere|vcenter|esxi|\bvcf\b|\bvsan\b|openstackit|(?<!SE)클라우드잇|proxmox|프록스목스|popcon|smartx|jdesktop|j-virtual/i.test(title);
  if (/\bopenshift\s*virtualization\b|오픈시프트\s*가상화/i.test(title) && !/paas|컨테이너|쿠버네티스|kubernetes/i.test(title)) return "가상화";
  if (paas && virtualization) return null; // Mixed tender: no arbitrary allocation.
  return paas ? "PaaS" : virtualization ? "가상화" : null;
}
export function belongsToFamily(title: string, family: ProductFamily): boolean {
  return family === "통합" || productFamily(title) === family;
}
