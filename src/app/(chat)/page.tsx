"use client";
import React, { useState } from "react";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import Input from "@/components/Input";

interface MessageData {
  id: number;
  text: string;
  sender: "user" | "bot";
}

interface Chat {
  id: string;
  name: string;
  messages: MessageData[];
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  const handleNewChat = () => {
    const newChatId = Date.now().toString();
    const newChat: Chat = {
      id: newChatId,
      name: `Chat ${chats.length + 1}`,
      messages: [],
    };
    setChats([...chats, newChat]);
    setCurrentChatId(newChatId);
  };

  const handleSelectChat = (chatId: string) => {
    setCurrentChatId(chatId);
  };

  const handleToggleCollapse = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleSendMessage = (text: string) => {
    if (!currentChatId) return;
    const newMessage: MessageData = {
      id: Date.now(),
      text,
      sender: "user",
    };
    setChats(
      chats.map((chat) =>
        chat.id === currentChatId
          ? { ...chat, messages: [...chat.messages, newMessage] }
          : chat
      )
    );
  };

  const handleDeleteChat = (chatId: string) => {
    const newChats = chats.filter((chat) => chat.id !== chatId);
    setChats(newChats);
    if (currentChatId === chatId) {
      if (newChats.length > 0) {
        setCurrentChatId(newChats[0].id);
      } else {
        setCurrentChatId("");
      }
    }
  };

  const currentChat = chats.find((chat) => chat.id === currentChatId) || null;

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <div className="hidden md:block">
        {/* <Sidebar
          chats={chats}
          currentChatId={currentChatId}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        /> */}
      </div>
      <div className="flex flex-col flex-1">
        <ChatArea messages={currentChat ? currentChat.messages : []} />
        <Input onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
}
