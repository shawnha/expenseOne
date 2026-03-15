import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface NewDepositRequestEmailProps {
  expenseName: string;
  amount: number;
  submitterName: string;
  expenseUrl: string;
}

function formatAmount(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export default function NewDepositRequestEmail({
  expenseName,
  amount,
  submitterName,
  expenseUrl,
}: NewDepositRequestEmailProps) {
  const previewText = `${submitterName}님이 새로운 입금요청을 제출했습니다.`;

  return (
    <Html lang="ko">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={headerLabel}>ExpenseFlow</Text>
          </Section>

          <Section style={content}>
            <Heading style={heading}>새 입금요청 도착</Heading>
            <Text style={paragraph}>
              새로운 입금요청이 제출되었습니다. 검토 후 승인 또는 반려해 주세요.
            </Text>

            <Section style={detailBox}>
              <Text style={detailRow}>
                <span style={detailLabel}>제목</span>
                <span style={detailValue}>{expenseName}</span>
              </Text>
              <Hr style={detailDivider} />
              <Text style={detailRow}>
                <span style={detailLabel}>금액</span>
                <span style={detailValue}>{formatAmount(amount)}</span>
              </Text>
              <Hr style={detailDivider} />
              <Text style={detailRow}>
                <span style={detailLabel}>제출자</span>
                <span style={detailValue}>{submitterName}</span>
              </Text>
            </Section>

            <Section style={buttonContainer}>
              <Link href={expenseUrl} style={button}>
                요청 검토하기
              </Link>
            </Section>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              이 메일은 ExpenseFlow에서 자동 발송되었습니다.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

const container: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "20px 0 48px",
};

const header: React.CSSProperties = {
  padding: "24px 32px",
};

const headerLabel: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#1a1a2e",
  margin: 0,
};

const content: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "32px",
  border: "1px solid #e5e7eb",
};

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#1a1a2e",
  margin: "0 0 12px",
};

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#4b5563",
  margin: "0 0 24px",
};

const detailBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "6px",
  padding: "16px 20px",
  marginBottom: "24px",
};

const detailRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "20px",
  color: "#111827",
  margin: "8px 0",
  display: "flex",
  justifyContent: "space-between",
};

const detailLabel: React.CSSProperties = {
  color: "#6b7280",
  fontWeight: 500,
};

const detailValue: React.CSSProperties = {
  fontWeight: 600,
  color: "#111827",
};

const detailDivider: React.CSSProperties = {
  borderTop: "1px solid #e5e7eb",
  margin: "8px 0",
};

const buttonContainer: React.CSSProperties = {
  textAlign: "center" as const,
};

const button: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "6px",
};

const footer: React.CSSProperties = {
  padding: "24px 32px 0",
};

const footerText: React.CSSProperties = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  margin: 0,
};
