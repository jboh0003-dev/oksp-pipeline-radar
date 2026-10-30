"use client";
import {useState} from "react";

export default function CopyReference({value}:{value:string}) {
  const [copied,setCopied]=useState(false);
  return <button type="button" onClick={async ()=>{
    try {await navigator.clipboard.writeText(value);setCopied(true);}
    catch {setCopied(false);}
  }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
    {copied?"번호 복사됨":"번호 복사"}
  </button>;
}
