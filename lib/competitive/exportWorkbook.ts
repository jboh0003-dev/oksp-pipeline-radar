import {belongsToFamily, type ProductFamily} from "./productFamily";
import {broadRegion} from "./region";
import {vendorFromAward, vendorFromDelivery, isCompetitiveDeliveryProduct, classifyDeliveryProduct} from "./vendorEvidence";

type Delivery = {external_key:string;receipt_date:string;product_name:string;product_id:string|null;brand:string|null;supplier_name:string|null;supplier_business_no:string|null;customer_name:string|null;amount:number|null;delivery_request_no:string};
type Award = {external_key:string;award_date:string|null;project:string;customer:string|null;winner_name:string;amount:number|null;bid_no:string;product_brand:string|null};
type Direct = {external_key:string;award_date:string|null;project:string;customer:string|null;winner_name:string;amount:number|null;bid_no:string;competitor:string};

const won=(value:number|null|undefined)=>Number(value??0)||0;
const text=(value:unknown)=>String(value??"").replace(/^[=+@\-\t\r]/,"'$&");

export async function exportCompetitiveWorkbook(input:{
  deliveries:Delivery[];awards:Award[];directAwards:Direct[];
  year:string;vendor:string;type:string;family:ProductFamily;agency:string;si:string;query:string;
}) {
  const ExcelJS=(await import("exceljs")).default;
  const workbook=new ExcelJS.Workbook();
  workbook.creator="Pipeline Maker";
  const selected=input.deliveries.filter(r=>(isCompetitiveDeliveryProduct(r.product_name)||r.product_name.toLowerCase().includes("paas")||r.product_name.toLowerCase().includes("viola"))&&vendorFromDelivery(r));
  const agencies=[...new Set([...selected.map(r=>r.customer_name),...input.awards.map(r=>r.customer),...input.directAwards.map(r=>r.customer)].filter((x):x is string=>!!x))];
  const regions:Record<string,string>={};
  // 마스터 매칭 실패 시에도 다운로드는 가능하다. 해당 건은 '지역 미확인'으로 남긴다.
  for(let i=0;i<agencies.length;i+=500){
    try{
      const response=await fetch("/api/customer-accounts/match",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agencies:agencies.slice(i,i+500)})});
      if(response.ok){const body=await response.json();const matches=body.data?.matches??body.matches??{};
        for(const [name,match] of Object.entries(matches))regions[name]=(match as {region?:string;regionGroup?:string}).region??(match as {regionGroup?:string}).regionGroup??"";}
    }catch{/* 지역 정보가 없는 건은 미확인으로 표시 */}
  }
  const region=(agency:string|null)=>broadRegion(regions[agency??""],agency);
  const deliveries=selected.filter(r=>{
    const v=vendorFromDelivery(r)?.vendor;
    return belongsToFamily(r.product_name,input.family)&&(input.year==="전체"||r.receipt_date?.startsWith(input.year))&&(input.vendor==="전체"||v===input.vendor)&&
      (input.agency==="전체"||r.customer_name===input.agency)&&(input.si==="전체"||input.si===r.supplier_business_no)&&
      (input.type==="전체"||classifyDeliveryProduct(r.product_name)===input.type)&&
      (!input.query||[r.product_name,r.brand,r.supplier_name,r.customer_name,r.delivery_request_no].some(x=>String(x??"").toLowerCase().includes(input.query.toLowerCase())));
  });
  const awards=input.awards.filter(r=>vendorFromAward(r)&&belongsToFamily(r.project,input.family)&&(input.year==="전체"||r.award_date?.startsWith(input.year))&&
    (input.vendor==="전체"||vendorFromAward(r)?.vendor===input.vendor)&&(input.agency==="전체"||r.customer===input.agency)&&
    (!input.query||[r.project,r.customer,r.winner_name,r.bid_no].some(x=>String(x??"").toLowerCase().includes(input.query.toLowerCase()))));
  const direct=input.directAwards.filter(r=>input.family==="통합"&&(input.year==="전체"||r.award_date?.startsWith(input.year))&&
    (input.vendor==="전체"||r.competitor===input.vendor)&&(input.agency==="전체"||r.customer===input.agency));
  const rows=deliveries.map(r=>({vendor:vendorFromDelivery(r)!.vendor,region:region(r.customer_name),amount:won(r.amount),year:r.receipt_date.slice(0,4)}));
  const makeSheet=(title:string,headers:string[],data:(string|number)[][])=>{
    const sheet=workbook.addWorksheet(title,{views:[{state:"frozen",ySplit:1}]});
    sheet.addRow(headers);sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF17243A"}};
    for(const values of data)sheet.addRow(values.map(v=>typeof v==="string"?text(v):v));
    sheet.columns=headers.map((_,index)=>({width:index===0?27:Math.min(48,Math.max(15,...data.slice(0,200).map(row=>String(row[index]??"").length+2)))}));
    sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,data.length+1),column:headers.length}};
    sheet.eachRow((row,rowNo)=>{if(rowNo>1&&rowNo%2===0)row.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF3F6FA"}};row.alignment={vertical:"middle"};});
    return sheet;
  };
  const summarize=(key:(r:typeof rows[number])=>string)=>[...new Set(rows.map(key))].map(label=>{
    const group=rows.filter(r=>key(r)===label);return [label,group.length,group.reduce((sum,r)=>sum+r.amount,0),group.filter(r=>r.amount>0).length] as (string|number)[];
  }).sort((a,b)=>Number(b[2])-Number(a[2]));
  const summary=makeSheet("제조사 요약",["제조사","조달 건수","공급금액 (원)","금액 확인 건수"],summarize(r=>r.vendor));
  makeSheet("지역별 요약",["지역","조달 건수","공급금액 (원)","금액 확인 건수"],summarize(r=>r.region));
  makeSheet("연도별 요약",["연도","조달 건수","공급금액 (원)","금액 확인 건수"],summarize(r=>r.year));
  makeSheet("지역×제조사",["지역","제조사","조달 건수","공급금액 (원)"],
    [...new Set(rows.map(r=>`${r.region}|${r.vendor}`))].map(key=>{const [area,vendor]=key.split("|");const group=rows.filter(r=>r.region===area&&r.vendor===vendor);return [area,vendor,group.length,group.reduce((sum,r)=>sum+r.amount,0)];}));
  makeSheet("조달 공급 상세",["요구일","지역","제조사","제품","물품식별번호","공급업체","수요기관","공급금액 (원)","납품요구번호"],
    deliveries.map(r=>[r.receipt_date,region(r.customer_name),vendorFromDelivery(r)!.vendor,r.product_name,r.product_id??"",r.supplier_name??"",r.customer_name??"",r.amount??"",r.delivery_request_no]));
  makeSheet("입찰사업 수주",["낙찰일","지역","제조사","사업명","낙찰업체","수요기관","전체 계약금액 (원)","공고번호"],
    awards.map(r=>[r.award_date??"",region(r.customer),vendorFromAward(r)!.vendor,r.project,r.winner_name,r.customer??"",r.amount??"",r.bid_no]));
  makeSheet("별도 추적 수주",["낙찰일","지역","추적업체","사업명","낙찰업체","수요기관","전체 계약금액 (원)","공고번호"],
    direct.map(r=>[r.award_date??"",region(r.customer),r.competitor,r.project,r.winner_name,r.customer??"",r.amount??"",r.bid_no]));
  for(const sheet of workbook.worksheets)for(const row of sheet.getRows(2,Math.max(0,sheet.rowCount-1))??[])row.eachCell(cell=>{if(typeof cell.value==="number")cell.numFmt="#,##0";});
  summary.getCell("F1").value="기준: 나라장터 납품요구액 (매출 확정 아님)";
  summary.getCell("F2").value=`분석 연도: ${input.year} / 제조사: ${input.vendor}`;
  summary.getCell("F3").value="지역 미확인: 고객사 마스터 또는 기관명으로 지역을 확인할 수 없는 건";
  const buffer=await workbook.xlsx.writeBuffer();
  const blob=new Blob([buffer as BlobPart],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;
  link.download=`수주이력_경쟁분석_${input.year}_${new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"})}.xlsx`;
  link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
