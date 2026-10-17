"use client";
/* eslint-disable @next/next/no-img-element -- account avatars are dynamic external URLs. */

import { Heart, Lightbulb, MessageSquareText, Repeat, Send, ThumbsUp, Triangle } from "lucide-react";

// Sample engagement so the preview reads like a live feed post.
const SAMPLE_COUNTS = { reactions: 83, comments: 18, reposts: 8 };

/**
 * LinkedIn's social action row: the viewer's "react as" avatar, then Like,
 * Comment, Repost and Send, each icon followed by its count, with the reaction
 * stack pinned right. Lucide has no LinkedIn set; these are its closest shapes.
 */
export default function LinkedInPostActions({
  avatarUrl,
  initials,
}: {
  avatarUrl?: string;
  initials: string;
}) {
  return (
    <div className="mq-linkedin-social" aria-hidden="true">
      <span className="mq-linkedin-react-as">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{initials}</span>}
        <Triangle className="mq-linkedin-react-caret" size={10} fill="currentColor" strokeWidth={0} />
      </span>
      <span className="mq-linkedin-social-action">
        <ThumbsUp size={20} strokeWidth={1.6} />
        <span>{SAMPLE_COUNTS.reactions}</span>
      </span>
      <span className="mq-linkedin-social-action">
        {/* Mirrored so the tail sits bottom-right, and drawn wider, as LinkedIn's bubble is. */}
        <MessageSquareText className="mq-linkedin-comment-icon" width={22} height={19} preserveAspectRatio="none" strokeWidth={1.6} />
        <span>{SAMPLE_COUNTS.comments}</span>
      </span>
      <span className="mq-linkedin-social-action">
        <Repeat size={19} strokeWidth={1.7} />
        <span>{SAMPLE_COUNTS.reposts}</span>
      </span>
      <span className="mq-linkedin-social-action">
        <Send size={20} fill="currentColor" strokeWidth={1.4} />
      </span>
      <span className="mq-linkedin-reaction-stack">
        <span className="is-like"><ThumbsUp size={9} fill="currentColor" strokeWidth={1.5} /></span>
        <span className="is-love"><Heart size={9} fill="currentColor" strokeWidth={1.5} /></span>
        <span className="is-insightful"><Lightbulb size={9} strokeWidth={2} /></span>
      </span>
    </div>
  );
}
