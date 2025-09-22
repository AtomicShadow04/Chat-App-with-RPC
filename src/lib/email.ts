import nodemailer from "nodemailer";

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailData {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

// Default email configuration - should be overridden by environment variables
const defaultConfig: EmailConfig = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
};

// Create reusable transporter object
export const createTransporter = (config?: Partial<EmailConfig>) => {
  const finalConfig = { ...defaultConfig, ...config };

  return nodemailer.createTransport({
    host: finalConfig.host,
    port: finalConfig.port,
    secure: finalConfig.secure,
    auth: {
      user: finalConfig.auth.user,
      pass: finalConfig.auth.pass,
    },
  });
};

// Default transporter instance
export const transporter = createTransporter();

// Send email function
export const sendEmail = async (
  emailData: EmailData,
  config?: Partial<EmailConfig>
) => {
  try {
    const emailTransporter = config ? createTransporter(config) : transporter;

    const mailOptions = {
      from: emailData.from || process.env.FROM_EMAIL || defaultConfig.auth.user,
      to: emailData.to,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
    };

    const info = await emailTransporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    console.error("Email sending failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
};

// Verify transporter connection
export const verifyConnection = async (config?: Partial<EmailConfig>) => {
  try {
    const emailTransporter = config ? createTransporter(config) : transporter;
    await emailTransporter.verify();
    return { success: true, message: "SMTP connection verified successfully" };
  } catch (error) {
    console.error("SMTP connection failed:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Connection verification failed",
    };
  }
};

// Common email templates
export const emailTemplates = {
  welcome: (name: string, appName: string = "Chat App") => ({
    subject: `Welcome to ${appName}!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Welcome to ${appName}!</h1>
        <p>Hi ${name},</p>
        <p>Thank you for joining our chat application. We're excited to have you on board!</p>
        <p>Get started by exploring our features and connecting with others.</p>
        <p>Best regards,<br>The ${appName} Team</p>
      </div>
    `,
    text: `Welcome to ${appName}!\n\nHi ${name},\n\nThank you for joining our chat application. We're excited to have you on board!\n\nGet started by exploring our features and connecting with others.\n\nBest regards,\nThe ${appName} Team`,
  }),

  passwordReset: (
    name: string,
    resetLink: string,
    appName: string = "Chat App"
  ) => ({
    subject: `Password Reset - ${appName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Password Reset Request</h1>
        <p>Hi ${name},</p>
        <p>You recently requested to reset your password for your ${appName} account.</p>
        <p>Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
        </div>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p>This link will expire in 1 hour for security reasons.</p>
        <p>Best regards,<br>The ${appName} Team</p>
      </div>
    `,
    text: `Password Reset Request\n\nHi ${name},\n\nYou recently requested to reset your password for your ${appName} account.\n\nClick the link below to reset your password:\n${resetLink}\n\nIf you didn't request this password reset, please ignore this email.\n\nThis link will expire in 1 hour for security reasons.\n\nBest regards,\nThe ${appName} Team`,
  }),

  notification: (
    name: string,
    message: string,
    appName: string = "Chat App"
  ) => ({
    subject: `New Notification - ${appName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">New Notification</h1>
        <p>Hi ${name},</p>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
          <p>${message}</p>
        </div>
        <p>Best regards,<br>The ${appName} Team</p>
      </div>
    `,
    text: `New Notification\n\nHi ${name},\n\n${message}\n\nBest regards,\nThe ${appName} Team`,
  }),
};
