"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: any;
}

export default function EmailTestPage() {
  const [formData, setFormData] = useState({
    to: "",
    subject: "",
    text: "",
    html: "",
    template: "",
    name: "",
    resetLink: "",
    message: "",
    appName: "Chat App",
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EmailResponse | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<EmailResponse | null>(null);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const testConnection = async () => {
    setLoading(true);
    setConnectionStatus(null);

    try {
      const response = await fetch("/api/email");
      const data = await response.json();
      setConnectionStatus(data);
    } catch (error) {
      setConnectionStatus({
        success: false,
        error: "Failed to test connection",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendCustomEmail = async () => {
    if (
      !formData.to ||
      !formData.subject ||
      (!formData.text && !formData.html)
    ) {
      setResult({
        success: false,
        error:
          "Please fill in required fields (to, subject, and either text or html)",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: formData.to,
          subject: formData.subject,
          text: formData.text || undefined,
          html: formData.html || undefined,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: "Failed to send email",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendTemplateEmail = async () => {
    if (!formData.to || !formData.template || !formData.name) {
      setResult({
        success: false,
        error: "Please fill in required fields (to, template, name)",
      });
      return;
    }

    // Validate template-specific fields
    if (formData.template === "passwordReset" && !formData.resetLink) {
      setResult({
        success: false,
        error: "Reset link is required for password reset template",
      });
      return;
    }

    if (formData.template === "notification" && !formData.message) {
      setResult({
        success: false,
        error: "Message is required for notification template",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const templateData: any = {
        name: formData.name,
        appName: formData.appName,
      };

      if (formData.template === "passwordReset") {
        templateData.resetLink = formData.resetLink;
      }

      if (formData.template === "notification") {
        templateData.message = formData.message;
      }

      const response = await fetch("/api/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: formData.to,
          template: formData.template,
          templateData,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: "Failed to send template email",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Email System Test</h1>
        <p className="text-gray-600 mt-2">
          Test the Nodemailer configuration and email sending functionality
        </p>
      </div>

      {/* Connection Test */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Test</CardTitle>
          <CardDescription>Verify SMTP connection settings</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={testConnection} disabled={loading} className="mb-4">
            {loading ? "Testing..." : "Test SMTP Connection"}
          </Button>

          {connectionStatus && (
            <div
              className={`p-4 rounded-md ${
                connectionStatus.success
                  ? "bg-green-100 border border-green-300"
                  : "bg-red-100 border border-red-300"
              }`}
            >
              <p
                className={`font-semibold ${
                  connectionStatus.success ? "text-green-800" : "text-red-800"
                }`}
              >
                {connectionStatus.success
                  ? "✓ Connection Successful"
                  : "✗ Connection Failed"}
              </p>
              {connectionStatus.error && (
                <p className="text-red-600 text-sm mt-1">
                  {connectionStatus.error}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Email Test */}
      <Card>
        <CardHeader>
          <CardTitle>Send Custom Email</CardTitle>
          <CardDescription>
            Send a custom email with your own content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="to">To Email *</Label>
            <Input
              id="to"
              type="email"
              value={formData.to}
              onChange={(e) => handleInputChange("to", e.target.value)}
              placeholder="recipient@example.com"
            />
          </div>

          <div>
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => handleInputChange("subject", e.target.value)}
              placeholder="Email subject"
            />
          </div>

          <div>
            <Label htmlFor="text">Text Content</Label>
            <Textarea
              id="text"
              value={formData.text}
              onChange={(e) => handleInputChange("text", e.target.value)}
              placeholder="Plain text email content"
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="html">HTML Content</Label>
            <Textarea
              id="html"
              value={formData.html}
              onChange={(e) => handleInputChange("html", e.target.value)}
              placeholder="<h1>HTML email content</h1>"
              rows={3}
            />
          </div>

          <Button onClick={sendCustomEmail} disabled={loading}>
            {loading ? "Sending..." : "Send Custom Email"}
          </Button>
        </CardContent>
      </Card>

      {/* Template Email Test */}
      <Card>
        <CardHeader>
          <CardTitle>Send Template Email</CardTitle>
          <CardDescription>
            Send an email using predefined templates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="template-to">To Email *</Label>
            <Input
              id="template-to"
              type="email"
              value={formData.to}
              onChange={(e) => handleInputChange("to", e.target.value)}
              placeholder="recipient@example.com"
            />
          </div>

          <div>
            <Label htmlFor="template">Template *</Label>
            <Select
              value={formData.template}
              onValueChange={(value) => handleInputChange("template", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="welcome">Welcome Email</SelectItem>
                <SelectItem value="passwordReset">Password Reset</SelectItem>
                <SelectItem value="notification">Notification</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder="Recipient's name"
            />
          </div>

          {formData.template === "passwordReset" && (
            <div>
              <Label htmlFor="resetLink">Reset Link *</Label>
              <Input
                id="resetLink"
                type="url"
                value={formData.resetLink}
                onChange={(e) => handleInputChange("resetLink", e.target.value)}
                placeholder="https://example.com/reset?token=..."
              />
            </div>
          )}

          {formData.template === "notification" && (
            <div>
              <Label htmlFor="message">Message *</Label>
              <Textarea
                id="message"
                value={formData.message}
                onChange={(e) => handleInputChange("message", e.target.value)}
                placeholder="Notification message"
                rows={2}
              />
            </div>
          )}

          <div>
            <Label htmlFor="appName">App Name</Label>
            <Input
              id="appName"
              value={formData.appName}
              onChange={(e) => handleInputChange("appName", e.target.value)}
              placeholder="Chat App"
            />
          </div>

          <Button onClick={sendTemplateEmail} disabled={loading}>
            {loading ? "Sending..." : "Send Template Email"}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`p-4 rounded-md ${
                result.success
                  ? "bg-green-100 border border-green-300"
                  : "bg-red-100 border border-red-300"
              }`}
            >
              <p
                className={`font-semibold ${
                  result.success ? "text-green-800" : "text-red-800"
                }`}
              >
                {result.success
                  ? "✓ Email Sent Successfully"
                  : "✗ Email Failed"}
              </p>
              {result.messageId && (
                <p className="text-green-600 text-sm mt-1">
                  Message ID: {result.messageId}
                </p>
              )}
              {result.error && (
                <p className="text-red-600 text-sm mt-1">{result.error}</p>
              )}
              {result.details && (
                <pre className="text-xs mt-2 bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify(result.details, null, 2)}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
