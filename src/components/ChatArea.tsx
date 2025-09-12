import React from "react";
import Message from "./Message";

interface MessageData {
  id: number;
  text: string;
  sender: "user" | "bot";
}

interface ChatAreaProps {
  messages: MessageData[];
}

const ChatArea: React.FC<ChatAreaProps> = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <div className="flex-1 bg-gray-100 dark:bg-gray-800 p-4 overflow-y-auto flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Welcome to Chat App!</h1>
          <p>How can I help you today?</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-100 dark:bg-gray-800 p-4 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-4">
        {messages.map((message) => (
          <Message
            key={message.id}
            text={message.text}
            sender={message.sender}
          />
        ))}
      </div>
    </div>
  );
};

export default ChatArea;
