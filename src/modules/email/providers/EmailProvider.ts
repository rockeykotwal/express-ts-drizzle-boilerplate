export interface SendEmailOptions {
  to:       string;
  subject:  string;
  html:     string;
  text?:    string; // plain-text fallback for clients that don't render HTML
}

export interface EmailProvider {
  send(options: SendEmailOptions): Promise<void>;
}
