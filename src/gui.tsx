import {
  Command,
  MenuItem,
  Panel,
  Plugin,
  Style,
  type PanelTab,
} from "@opencode/plugin/gui"
import { ReviewPanel, openReviewDialog } from "./gui/review.tsx"
import { panelCss } from "./gui/styles.ts"

const reviewTab: PanelTab = {
  id: "review",
  title: "Review changes",
  closable: "compact",
  fallback: true,
}

export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, panelCss)

    ctx.add(Panel, {
      id: "review",
      region: "side",
      width: "narrow",
      list: (input) => (input.open.includes("review") ? [reviewTab] : []),
      render: (props) => <ReviewPanel session={props.session} />,
    })

    ctx.add(
      Command,
      (): Command => ({
        id: "review",
        title: "Review recent changes",
        description: "Open the step-by-step diff of changes made in this session",
        keywords: "diff changes history revert steps",
        section: "session",
        bind: "mod+shift+d",
        slash: { name: "changes" },
        run: () => {
          const session = ctx.sessions.current()
          if (session) openReviewDialog(ctx, session)
        },
      }),
    )

    ctx.add(
      Command,
      (): Command => ({
        id: "review-fullscreen",
        title: "Review changes (fullscreen)",
        description: "Open the step-by-step diff fullscreen",
        keywords: "diff changes fullscreen steps",
        section: "session",
        run: () => {
          const session = ctx.sessions.current()
          if (session) openReviewDialog(ctx, session, { expanded: true })
        },
      }),
    )

    ctx.add(
      MenuItem,
      (): MenuItem => {
        const session = ctx.sessions.current()
        return {
          menu: "session.panel",
          id: "review",
          title: "Review changes",
          icon: "review",
          opened: !!session && ctx.layout.state(`${ctx.id}:review`, session) !== "closed",
          run: () => {
            if (session) ctx.layout.open(`${ctx.id}:review`, session, { tab: "select" })
          },
        }
      },
    )
  },
})
