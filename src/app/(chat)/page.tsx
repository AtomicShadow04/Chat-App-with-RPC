"use client";
import React, { useState, useCallback, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import Input from "@/components/Input";
import { SidebarToggle } from "@/components/sidebar-toggle";

interface MessageData {
  id: string;
  text: string;
  sender: "user" | "bot";
  timestamp: Date;
}

interface Chat {
  id: string;
  name: string;
  messages: MessageData[];
  createdAt: Date;
  updatedAt: Date;
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Auto-create first chat if none exist
  useEffect(() => {
    if (chats.length === 0) {
      handleNewChat();
    }
  }, []);

  const generateChatName = useCallback((messages: MessageData[]): string => {
    if (messages.length === 0) return "New Chat";
    const firstUserMessage = messages.find(msg => msg.sender === "user");
    if (firstUserMessage) {
      const truncated = firstUserMessage.text.slice(0, 30);
      return truncated.length < firstUserMessage.text.length 
        ? `${truncated}...` 
        : truncated;
    }
    return "New Chat";
  }, []);

  const handleNewChat = useCallback(() => {
    const newChatId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newChat: Chat = {
      id: newChatId,
      name: "New Chat",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChatId);
    setIsMobileMenuOpen(false);
  }, []);

  const handleSelectChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    setIsMobileMenuOpen(false);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
  }, []);

  const handleToggleMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(prev => !prev);
  }, []);

  const handleSendMessage = useCallback(async (text: string) => {
    if (!currentChatId || !text.trim()) return;
    
    setIsLoading(true);
    const userMessage: MessageData = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: text.trim(),
      sender: "user",
      timestamp: new Date(),
    };

    // Add user message
    setChats(prev => prev.map(chat =>
      chat.id === currentChatId
        ? { 
            ...chat, 
            messages: [...chat.messages, userMessage],
            updatedAt: new Date(),
            name: chat.messages.length === 0 ? generateChatName([userMessage]) : chat.name
          }
        : chat
    ));

    // Simulate bot response (replace with actual API call)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
      
      const botMessage: MessageData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: `I received your message: "${text.trim()}". This is a simulated response.`,
        sender: "bot",
        timestamp: new Date(),
      };

      setChats(prev => prev.map(chat =>
        chat.id === currentChatId
          ? { 
              ...chat, 
              messages: [...chat.messages, botMessage],
              updatedAt: new Date()
            }
          : chat
      ));
    } catch (error) {
      console.error("Failed to send message:", error);
      // Handle error state here
    } finally {
      setIsLoading(false);
    }
  }, [currentChatId, generateChatName]);

  const handleDeleteChat = useCallback((chatId: string) => {
    const newChats = chats.filter(chat => chat.id !== chatId);
    setChats(newChats);
    
    if (currentChatId === chatId) {
      if (newChats.length > 0) {
        setCurrentChatId(newChats[0].id);
      } else {
        // Create new chat if all chats are deleted
        handleNewChat();
      }
    }
  }, [chats, currentChatId, handleNewChat]);

  const handleRenameChat = useCallback((chatId: string, newName: string) => {
    setChats(prev => prev.map(chat =>
      chat.id === chatId
        ? { ...chat, name: newName.trim() || "Untitled Chat", updatedAt: new Date() }
        : chat
    ));
  }, []);

  const currentChat = chats.find((chat) => chat.id === currentChatId) || null;

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <div className="flex flex-col w-full ">
        <ChatHeader />
        <div className="flex flex-col flex-1">
          <ChatArea messages={currentChat ? currentChat.messages : []} />
          <Input onSendMessage={handleSendMessage} />
        </div>
      </div>
    </div>
  );
}

const ChatHeader = () => {
  return (
    <div className="flex items-center justify-start p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 gap-5
">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Chat</h2>
      <SidebarToggle />
    </div>
  );
};