// ============================================================
// PrologueStage — 序章车卡页（P1#6）
// ============================================================
import React from 'react';

interface PrologueStageProps {
  prologueHtml: string;
  onStartAdventure: () => void;
}

export const PrologueStage: React.FC<PrologueStageProps> = ({ prologueHtml, onStartAdventure }) => {
  if (!prologueHtml) return null;

  return (
    <div className="absolute inset-0 z-40 bg-[#13141c] flex flex-col rounded-lg overflow-hidden"
      style={{ top: '37px' }}>
      <iframe
        srcDoc={prologueHtml}
        className="flex-1 w-full border-0"
        title="Prologue"
        sandbox="allow-scripts allow-same-origin"
      />
      <div className="p-4 flex justify-center bg-[#13141c] border-t border-[#2a2b36]">
        <button
          onClick={onStartAdventure}
          className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110
            active:scale-95 active:brightness-90 text-white rounded-lg text-lg font-medium
            transition-all duration-300 ease-bounce-soft"
        >
          开始冒险
        </button>
      </div>
    </div>
  );
};
