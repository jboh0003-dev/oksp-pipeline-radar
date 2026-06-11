"use client";

import type { AttachmentInfo } from "@/lib/attachments";

/**
 * RFP / 규격서 / 과업지시서 / 첨부 N 버튼을 한 묶음으로 보여주는 컴포넌트.
 *
 *  - 해당 type 의 파일이 있으면 클릭 가능한 a 태그로 새 탭에서 열기.
 *  - 없으면 비활성화 톤 (회색 작은 라벨) — 요구사항: "파일이 없으면 비활성화".
 *  - 일반 첨부는 N 개 합쳐 "첨부 N" 한 버튼으로 노출. URL 이 1건이면 직접 링크,
 *    여러 개면 첫 번째로 이동 + tooltip 으로 전체 이름 노출.
 *  - 사전규격에서 specDoc 강조 색을 줄지 여부는 emphasizeSpec 옵션으로 조정.
 */

type Props = {
  attachments: AttachmentInfo[];
  /** 사전규격공고에서는 규격서 버튼을 더 강조해 표시. */
  emphasizeSpec?: boolean;
  /** 작게 표시할지 여부. 기본 false (= 일반 sm 크기). */
  compact?: boolean;
};

const BUTTON_BASE =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-[11px] font-semibold transition";

const ENABLED_TONE: Record<string, string> = {
  RFP: "bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500",
  TASK: "bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500",
  SPEC: "bg-cyan-600 text-white hover:bg-cyan-700 dark:bg-cyan-500",
  SPEC_EMPHASIZE:
    "bg-cyan-600 text-white shadow-sm ring-2 ring-cyan-300/60 hover:bg-cyan-700 dark:bg-cyan-500 dark:ring-cyan-300/40",
  ETC: "bg-slate-600 text-white hover:bg-slate-700 dark:bg-slate-500",
};

const DISABLED_TONE =
  "bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500 cursor-not-allowed";

function btnSize(compact: boolean) {
  return compact ? "h-6 px-1.5" : "h-7 px-2";
}

function pickFirst(list: AttachmentInfo[], type: AttachmentInfo["type"]): AttachmentInfo | undefined {
  return list.find((a) => a.type === type);
}

function pickAny(list: AttachmentInfo[], types: AttachmentInfo["type"][]): AttachmentInfo | undefined {
  for (const t of types) {
    const f = pickFirst(list, t);
    if (f) return f;
  }
  return undefined;
}

export default function AttachmentButtons({ attachments, emphasizeSpec, compact }: Props) {
  const list = attachments ?? [];
  const rfp = pickAny(list, ["RFP", "제안요청서"]);
  const task = pickFirst(list, "과업지시서");
  const spec = pickFirst(list, "규격서");
  const others = list.filter(
    (a) =>
      a.type === "첨부파일" ||
      a.type === "기타" ||
      // 같은 type 안에서 두 번째부터는 "첨부" 묶음에 합친다.
      (a.type === "RFP" && a !== rfp) ||
      (a.type === "제안요청서" && a !== rfp) ||
      (a.type === "과업지시서" && a !== task) ||
      (a.type === "규격서" && a !== spec),
  );
  const otherUrl = others.find((a) => !!a.url)?.url;
  const otherCount = others.length;

  const sz = btnSize(!!compact);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {rfp ? (
        rfp.url ? (
          <a
            href={rfp.url}
            target="_blank"
            rel="noopener noreferrer"
            title={rfp.name}
            className={`${BUTTON_BASE} ${sz} ${ENABLED_TONE.RFP}`}
          >
            RFP ↗
          </a>
        ) : (
          <span title={rfp.name} className={`${BUTTON_BASE} ${sz} ${DISABLED_TONE}`}>
            RFP
          </span>
        )
      ) : null}

      {spec ? (
        spec.url ? (
          <a
            href={spec.url}
            target="_blank"
            rel="noopener noreferrer"
            title={spec.name}
            className={`${BUTTON_BASE} ${sz} ${
              emphasizeSpec ? ENABLED_TONE.SPEC_EMPHASIZE : ENABLED_TONE.SPEC
            }`}
          >
            규격서 ↗
          </a>
        ) : (
          <span title={spec.name} className={`${BUTTON_BASE} ${sz} ${DISABLED_TONE}`}>
            규격서
          </span>
        )
      ) : null}

      {task ? (
        task.url ? (
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            title={task.name}
            className={`${BUTTON_BASE} ${sz} ${ENABLED_TONE.TASK}`}
          >
            과업 ↗
          </a>
        ) : (
          <span title={task.name} className={`${BUTTON_BASE} ${sz} ${DISABLED_TONE}`}>
            과업
          </span>
        )
      ) : null}

      {otherCount > 0 ? (
        otherUrl ? (
          <a
            href={otherUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={others.map((a) => a.name).join("\n")}
            className={`${BUTTON_BASE} ${sz} ${ENABLED_TONE.ETC}`}
          >
            첨부 {otherCount}
          </a>
        ) : (
          <span
            title={others.map((a) => a.name).join("\n")}
            className={`${BUTTON_BASE} ${sz} ${DISABLED_TONE}`}
          >
            첨부 {otherCount}
          </span>
        )
      ) : null}

      {/* 첨부가 정말 0건이면 작게 안내. */}
      {!rfp && !spec && !task && otherCount === 0 ? (
        <span className={`${BUTTON_BASE} ${sz} ${DISABLED_TONE}`}>첨부없음</span>
      ) : null}
    </div>
  );
}
