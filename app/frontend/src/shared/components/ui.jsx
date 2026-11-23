// Lightweight design-system primitives (P1 performance).
//
// The app used four Atlaskit components (Button, Heading, Lozenge, SectionMessage). Through their
// transitive dependencies (feature-flag clients, analytics, top-layer, popper, tooltip, motion) they
// made up well over half of each bundle and dominated cold-start parse time. These replacements keep the
// same props the app uses, render native elements with the same semantics, and are styled only with
// Atlassian Design System tokens (CSS variables that Forge's theme injects), so light and dark themes
// flow through exactly as before. See product/P1_EXPERIENCE_RESULTS.md §4.

/** Native <button>. appearance: default | primary | subtle | danger | warning. */
export function Button({ appearance = 'default', isDisabled = false, shouldFitContainer = false, type = 'button', className = '', children, ...rest }) {
  const cls = `a25-btn a25-btn--${appearance}${shouldFitContainer ? ' a25-btn--fit' : ''}${className ? ` ${className}` : ''}`;
  return (
    <button type={type} className={cls} disabled={isDisabled} {...rest}>
      {children}
    </button>
  );
}

/** Status label. appearance: default | success | removed | inprogress | new | moved. */
export function Lozenge({ appearance = 'default', isBold = false, maxWidth, children }) {
  return (
    <span className={`a25-loz a25-loz--${appearance}${isBold ? ' a25-loz--bold' : ''}`} style={maxWidth ? { maxWidth } : undefined}>
      <span className="a25-loz__text">{children}</span>
    </span>
  );
}

const HEADING_SIZE = { xxsmall: 'xxsmall', xsmall: 'xsmall', small: 'small', medium: 'medium', large: 'large' };
/** Heading with an explicit level (`as`) and a visual size independent of the level. */
export function Heading({ as: Tag = 'h2', size = 'medium', id, children, ...rest }) {
  return (
    <Tag id={id} className={`a25-h a25-h--${HEADING_SIZE[size] ?? 'medium'}`} {...rest}>
      {children}
    </Tag>
  );
}

// 16px icons, decorative (the title and text carry the meaning).
const ICON_PATH = {
  information: 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 6a.9.9 0 0 0-.9.9v3.2a.9.9 0 1 0 1.8 0V7.9A.9.9 0 0 0 8 7Zm0-3a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  warning: 'M7.13 1.5a1 1 0 0 1 1.74 0l6.5 11.5a1 1 0 0 1-.87 1.5H1.5a1 1 0 0 1-.87-1.5l6.5-11.5ZM8 5a.9.9 0 0 0-.9.9v3.2a.9.9 0 1 0 1.8 0V5.9A.9.9 0 0 0 8 5Zm0 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  error: 'M5.1 1h5.8L15 5.1v5.8L10.9 15H5.1L1 10.9V5.1L5.1 1ZM8 4a.9.9 0 0 0-.9.9v3.7a.9.9 0 1 0 1.8 0V4.9A.9.9 0 0 0 8 4Zm0 6.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  success: 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm3.2 4.4a.9.9 0 0 0-1.27.06L7.1 8.6 5.97 7.47a.9.9 0 1 0-1.27 1.27l1.8 1.8a.9.9 0 0 0 1.3-.03l3.47-3.84a.9.9 0 0 0-.07-1.27Z',
  discovery: 'M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1Zm0 9.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM8 3.6c-1.4 0-2.5.9-2.6 2.2a.9.9 0 0 0 1.8.15c.03-.33.37-.55.8-.55.5 0 .8.27.8.6 0 .3-.17.45-.6.72-.6.37-1.1.82-1.1 1.68v.2a.9.9 0 0 0 1.8 0c0-.2.08-.3.48-.55.6-.37 1.22-.9 1.22-2.05 0-1.38-1.17-2.4-2.6-2.4Z',
};

/**
 * Contextual message. appearance: information | warning | error | success | discovery.
 * Mirrors Atlaskit's structure: <section> with an optional heading and an action list.
 */
export function SectionMessage({ appearance = 'information', title, headingLevel = 'h2', actions = [], children }) {
  const H = headingLevel;
  const list = (Array.isArray(actions) ? actions : [actions]).filter(Boolean);
  return (
    <section className={`a25-sm a25-sm--${appearance}`}>
      <svg className="a25-sm__icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d={ICON_PATH[appearance] ?? ICON_PATH.information} fill="currentColor" fillRule="evenodd" />
      </svg>
      <div className="a25-sm__body">
        {title ? <H className="a25-sm__title">{title}</H> : null}
        {children ? <div className="a25-sm__content">{children}</div> : null}
        {list.length ? (
          <ul className="a25-sm__actions" role={list.length > 1 ? 'list' : 'presentation'}>
            {list.map((a, i) => (
              <li key={a?.key ?? i} role={list.length > 1 ? 'listitem' : 'presentation'}>
                {a}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
