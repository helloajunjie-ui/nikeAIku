// ============================================================
// Play — 游玩界面（骨架层，所有逻辑委托给 usePlayEngine）
// ============================================================
import React from 'react';
import { usePlayEngine } from '../hooks/usePlayEngine';
import { PrologueStage } from '../components/play/PrologueStage';
import { ChatStage } from '../components/play/ChatStage';
import { InputConsole } from '../components/play/InputConsole';
import MemoryInspector from '../components/play/MemoryInspector';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';

export const Play: React.FC = () => {
  const { isAuthenticated } = useAuthStore();
  const { currentScenario, currentSave, currentTurn } = useGameStore();
  const engine = usePlayEngine();

  // 未登录守卫
  if (!isAuthenticated) {
    return (
      <div className="p-6 text-center text-gray-500">
        请先登录以开始游玩
      </div>
    );
  }

  const showPrologue = engine.showPrologue && engine.prologueHtml !== '';

  return (
    // 【核心 1】最外层：flex-row 横向布局，左侧聊天 + 右侧监控
    <div className="flex flex-row h-full w-full overflow-hidden bg-[#0e0f14]">

      {/* 👈 左侧：主聊天区（弹性） */}
      <div className="flex-1 min-w-0 flex flex-col h-full">

        {/* 🛠️ 第一层：头部控制栏 */}
        <div className="shrink-0 z-10">
          <InputConsole
            variant="header"
            scenarioName={currentScenario?.name}
            saveName={currentSave?.name}
            modelKey={engine.modelKey}
            onModelKeyChange={engine.setModelKey}
            useByok={engine.useByok}
            onSetUseByok={engine.setUseByok}
            engineStatus={engine.engineStatus}
            input={engine.input}
            isGenerating={engine.isGenerating}
            onInputChange={engine.setInput}
            onSend={engine.handleSend}
            onCancel={engine.handleCancel}
            showAuthorNotes={engine.showAuthorNotes}
            authorNotes={engine.authorNotes}
            showWorldbook={engine.showWorldbook}
            worldbookEntries={engine.worldbookEntries}
            editingWbId={engine.editingWbId}
            editingWbContent={engine.editingWbContent}
            showSaveSwitcher={engine.showSaveSwitcher}
            saveList={engine.saveList}
            lastTokenCount={engine.lastTokenCount}
            onSetShowAuthorNotes={engine.setShowAuthorNotes}
            onSetShowWorldbook={engine.setShowWorldbook}
            onSetShowSaveSwitcher={engine.setShowSaveSwitcher}
            onSetEditingWbId={engine.setEditingWbId}
            onSetEditingWbContent={engine.setEditingWbContent}
            onOpenWorldbook={engine.handleOpenWorldbook}
            onSaveWbEntry={engine.handleSaveWbEntry}
            onDeleteWbEntry={engine.handleDeleteWbEntry}
            onResetMemory={engine.handleResetMemory}
            onOpenSaveSwitcher={engine.handleOpenSaveSwitcher}
            onSwitchSave={engine.handleSwitchSave}
            onExportConversation={engine.handleExportConversation}
            onForkSave={engine.handleForkSave}
          />
        </div>

        {/* 💬 第二层：核心舞台 */}
        <div className="flex-1 overflow-y-auto scroll-smooth">
          {showPrologue ? (
            <PrologueStage
              prologueHtml={engine.prologueHtml}
              onStartAdventure={engine.handleStartAdventure}
            />
          ) : (
            <ChatStage
              conversations={engine.conversations}
              streamingContent={engine.streamingContent}
              editingMsgId={engine.editingMsgId}
              editContent={engine.editContent}
              highlightKeywords={engine.highlightKeywords}
              messagesEndRef={engine.messagesEndRef}
              isGenerating={engine.isGenerating}
              onStartEdit={engine.handleStartEdit}
              onSubmitEdit={engine.handleSubmitEdit}
              onCancelEdit={engine.handleCancelEdit}
              onDeleteFrom={engine.handleDeleteFrom}
              onReroll={engine.handleReroll}
              onSwipe={engine.handleSwipe}
              onSetEditContent={engine.setEditContent}
            />
          )}
        </div>

        {/* ⌨️ 第三层：吸底输入框 */}
        <div className="shrink-0 z-10">
          <InputConsole
            variant="input"
            modelKey={engine.modelKey}
            onModelKeyChange={engine.setModelKey}
            useByok={engine.useByok}
            onSetUseByok={engine.setUseByok}
            engineStatus={engine.engineStatus}
            input={engine.input}
            isGenerating={engine.isGenerating}
            onInputChange={engine.setInput}
            onSend={engine.handleSend}
            onCancel={engine.handleCancel}
            showAuthorNotes={engine.showAuthorNotes}
            authorNotes={engine.authorNotes}
            showWorldbook={engine.showWorldbook}
            worldbookEntries={engine.worldbookEntries}
            editingWbId={engine.editingWbId}
            editingWbContent={engine.editingWbContent}
            showSaveSwitcher={engine.showSaveSwitcher}
            saveList={engine.saveList}
            lastTokenCount={engine.lastTokenCount}
            onSetShowAuthorNotes={engine.setShowAuthorNotes}
            onSetShowWorldbook={engine.setShowWorldbook}
            onSetShowSaveSwitcher={engine.setShowSaveSwitcher}
            onSetEditingWbId={engine.setEditingWbId}
            onSetEditingWbContent={engine.setEditingWbContent}
            onOpenWorldbook={engine.handleOpenWorldbook}
            onSaveWbEntry={engine.handleSaveWbEntry}
            onDeleteWbEntry={engine.handleDeleteWbEntry}
            onResetMemory={engine.handleResetMemory}
            onOpenSaveSwitcher={engine.handleOpenSaveSwitcher}
            onSwitchSave={engine.handleSwitchSave}
            onExportConversation={engine.handleExportConversation}
            onForkSave={engine.handleForkSave}
          />
        </div>

      </div>

      {/* 👉 右侧：上帝监控台（大屏显示，小屏自动隐藏） */}
      <aside className="hidden xl:flex flex-col w-80 shrink-0 border-l border-white/5 bg-[#0e0f14]/50 backdrop-blur-xl h-full z-10 shadow-[-8px_0_32px_rgba(0,0,0,0.2)]">
        <MemoryInspector
          savId={currentSave?.sav_id}
          currentTurn={currentTurn}
        />
      </aside>

    </div>
  );
};
