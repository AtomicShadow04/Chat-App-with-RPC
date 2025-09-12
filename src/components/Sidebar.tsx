import React from "react";

interface Chat {
  id: string;
  name: string;
  messages: { id: number; text: string; sender: "user" | "bot" }[];
}

interface SidebarProps {
  chats: Chat[];
  currentChatId: string;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  chats,
  currentChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  isCollapsed,
  onToggleCollapse,
}) => {
  if (isCollapsed) {
    return (
      <div className="w-16 bg-gray-900 text-white p-4 flex flex-col items-center">
        <button className="mb-4 text-xl" onClick={onToggleCollapse}>
          ☰
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 bg-gray-900 text-white p-4">
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">Chat App</h2>
        <button className="text-xl" onClick={onToggleCollapse}>
          ‹
        </button>
      </div>
      <div className="space-y-2">
        <div
          className="bg-gray-800 p-3 rounded cursor-pointer hover:bg-gray-700"
          onClick={onNewChat}
        >
          New Chat
        </div>
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`p-3 rounded cursor-pointer hover:bg-gray-700 flex justify-between items-center ${
              chat.id === currentChatId ? "bg-gray-700" : "bg-gray-800"
            }`}
            onClick={() => onSelectChat(chat.id)}
          >
            <span>{chat.name}</span>
            <button
              className="ml-2 text-red-500 hover:text-red-700"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteChat(chat.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
