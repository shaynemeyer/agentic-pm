# Icon Update Plan

Add Lucide icons to interactive UI elements across the app. `lucide-react` v0.575.0 is
already installed and already used in `ui/sheet.tsx`.

## Icon Assignments

| Component                        | Button / Element    | Lucide Icon     | Style       |
| -------------------------------- | ------------------- | --------------- | ----------- |
| `src/components/KanbanCard.tsx`  | Delete card         | `Trash2`        | Icon-only   |
| `src/components/NewCardForm.tsx` | "Add a card" toggle | `Plus`          | Icon + text |
| `src/components/NewCardForm.tsx` | "Add card" submit   | `Plus`          | Icon + text |
| `src/components/NewCardForm.tsx` | "Cancel"            | `X`             | Icon + text |
| `src/components/chat/ChatSidebar.tsx` | Open chat FAB  | `MessageCircle` | Icon-only   |
| `src/components/chat/ChatSidebar.tsx` | Send message   | `SendHorizonal` | Icon-only   |
| `src/components/KanbanBoard.tsx` | Sign out            | `LogOut`        | Icon + text |
| `src/app/login/page.tsx`         | Sign in             | `LogIn`         | Icon + text |

## Notes

- No new packages needed; `lucide-react` is already a dependency.
- Icon-only buttons keep their existing `aria-label` for accessibility.
- The inline SVG in `ChatSidebar` (message bubble path) is replaced with `<MessageCircle size={22} />`.
