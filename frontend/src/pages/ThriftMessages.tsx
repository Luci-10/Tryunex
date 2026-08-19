import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageShell, { PageTitle } from "../components/PageShell";
import Button from "../components/ui/Button";
import Surface from "../components/ui/Surface";
import EmptyState from "../components/ui/EmptyState";
import { Badge } from "../components/ui/Chip";
import { Skeleton } from "../components/ui/Skeleton";
import { Input } from "../components/ui/Field";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/Confirm";
import ReportSheet from "../components/thrift/ReportSheet";
import { Block, Chat, ChevronLeft, Flag, Send } from "../components/ui/icons";
import ProtectedPhoto from "../components/ui/ProtectedPhoto";
import {
  CONVERSATION_REPORT_REASONS,
  PAYMENT_NOTE,
  STATUS_LABEL,
  STATUS_TONE,
  formatPrice,
  messageTime,
  thrift,
  type ConversationDetail,
  type ConversationSummary,
  type Message,
} from "../thrift";

const QUICK_REPLIES = [
  "Is this still available?",
  "Can you share the size details?",
  "Would you accept a lower price?",
  "I'm interested in buying this.",
];

/* ------------------------------------------------------------- inbox */

export function ThriftMessages() {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);

  useEffect(() => {
    thrift
      .conversations()
      .then((r) => setItems(r.conversations))
      .catch(() => setItems([]));
  }, []);

  return (
    <PageShell width="narrow">
      <PageTitle title="Thrift messages" subtitle="Your buyer and seller conversations." />

      {items === null ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Chat className="w-7 h-7" />}
          title="No thrift messages yet"
          body="When you message a seller or receive interest in a listing, conversations appear here."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                to={`/thrift/messages/${c.id}`}
                className="flex gap-3 rounded-card border border-ink/[0.06] bg-white shadow-card p-3 hover:shadow-lift transition-shadow"
              >
                <ProtectedPhoto
                  scope="listing"
                  id={c.listing.id}
                  src={c.listing.imageUrl}
                  alt=""
                  loading="lazy"
                  className="w-14 h-16 rounded-xl object-cover bg-ink/[0.04] shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] font-semibold leading-tight truncate">
                      {c.listing.title}
                    </p>
                    {c.unread > 0 && (
                      <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-brand-500 text-white text-[11px] font-bold grid place-items-center">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-ink/60 mt-0.5">
                    {c.role === "buyer" ? "Seller" : "Buyer"}: {c.otherName}
                  </p>
                  <p className="text-[12.5px] text-ink/70 mt-1 truncate">
                    {c.lastMessage ?? "No messages yet"}
                  </p>
                  <p className="text-[11px] text-ink/50 mt-1">{messageTime(c.lastMessageAt)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

/* ------------------------------------------------------ one conversation */

export function ThriftConversation() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const nav = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!conversationId) return;
    try {
      const r = await thrift.conversation(conversationId);
      setDetail(r.conversation);
      setMessages(r.messages);
      // Marking read is best-effort; a failure here must not block reading.
      thrift.markRead(conversationId).catch(() => {});
    } catch (e: any) {
      setError(e?.message ?? "Could not open this conversation");
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(body: string) {
    const text = body.trim();
    if (!text || busy || !conversationId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await thrift.send(conversationId, text);
      setMessages((prev) => [...prev, r.message]);
      setDraft("");
    } catch (e: any) {
      setError(e?.message ?? "Could not send that message");
    } finally {
      setBusy(false);
    }
  }

  async function blockOther() {
    if (!detail) return;
    const ok = await confirm({
      title: `Block ${detail.otherName}?`,
      body: "Neither of you can start new conversations, and this one becomes read-only.",
      confirmLabel: "Block",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await thrift.block(detail.otherUserId);
      toast("Blocked", { tone: "success" });
      nav("/thrift/messages");
    } catch (e: any) {
      toast(e?.message ?? "Could not block this user", { tone: "error" });
    }
  }

  if (!detail) {
    return (
      <PageShell width="narrow">
        <BackLink />
        {error ? <Surface tone="coral"><p className="text-sm">{error}</p></Surface> : <Skeleton className="h-64" />}
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow">
      <BackLink />

      {/* Pinned listing context */}
      <Link to={`/thrift/${detail.listing.id}`} className="block">
        <Surface padded={false} className="overflow-hidden hover:shadow-lift transition-shadow">
          <div className="flex gap-3 p-3 items-center">
            <ProtectedPhoto
              scope="listing"
              id={detail.listing.id}
              src={detail.listing.imageUrl}
              alt=""
              className="w-12 h-14 rounded-lg object-cover bg-ink/[0.04] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold truncate leading-tight">
                {detail.listing.title}
              </p>
              <p className="text-[14px] font-bold text-brand-700 mt-0.5">
                {formatPrice(detail.listing.pricePaise)}
              </p>
            </div>
            <Badge tone={STATUS_TONE[detail.listing.status]}>
              {STATUS_LABEL[detail.listing.status]}
            </Badge>
          </div>
        </Surface>
      </Link>

      <p className="text-[12.5px] text-ink/65">
        {detail.role === "buyer" ? "Seller" : "Buyer"}:{" "}
        <span className="font-semibold text-ink">{detail.otherName}</span>
      </p>

      {/* Thread */}
      <div className="space-y-2 min-h-[8rem]">
        {messages.length === 0 ? (
          <p className="text-[13px] text-ink/55 text-center py-4">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${
                  m.mine
                    ? "bg-brand-500 text-white rounded-br-md"
                    : "bg-white border border-ink/[0.08] rounded-bl-md"
                }`}
              >
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">
                  {m.body}
                </p>
                <p className={`text-[10.5px] mt-1 ${m.mine ? "text-white/65" : "text-ink/50"}`}>
                  {messageTime(m.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Composer, or the reason there isn't one */}
      {detail.closed ? (
        <Surface tone="butter">
          <p className="text-[13.5px] leading-relaxed">
            {detail.closedReason ?? "This conversation is now closed."}
          </p>
        </Surface>
      ) : (
        <div className="space-y-2">
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REPLIES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => send(r)}
                  className="min-h-[44px] px-3 rounded-full border border-ink/12 text-[13px] text-ink/75 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex gap-2"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message"
              aria-label="Message"
              maxLength={1000}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send message"
              className="shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>

          {error && <p className="text-[12.5px] text-coral leading-snug">{error}</p>}
        </div>
      )}

      <Surface tone="mint">
        <p className="text-[12.5px] leading-relaxed">
          Arrange payment and delivery directly with the seller. {PAYMENT_NOTE}
        </p>
      </Surface>

      <div className="flex flex-wrap gap-2 justify-center">
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="tap-44 inline-flex items-center gap-1.5 text-[13px] text-ink/60 hover:text-ink px-2"
        >
          <Flag className="w-4 h-4" />
          Report conversation
        </button>
        <button
          type="button"
          onClick={blockOther}
          className="tap-44 inline-flex items-center gap-1.5 text-[13px] text-ink/60 hover:text-coral px-2"
        >
          <Block className="w-4 h-4" />
          Block {detail.otherName}
        </button>
      </div>

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report this conversation"
        reasons={CONVERSATION_REPORT_REASONS}
        onSubmit={(reason, note) =>
          thrift.reportConversation(detail.id, reason, note).then(() => {})
        }
      />
    </PageShell>
  );
}

function BackLink() {
  return (
    <Link
      to="/thrift/messages"
      className="tap-44 inline-flex items-center gap-1 text-[13.5px] font-semibold text-brand-700 hover:underline"
    >
      <ChevronLeft className="w-4 h-4" />
      All messages
    </Link>
  );
}
