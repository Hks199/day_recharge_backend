type Field = { key: string; group: string; label: string; type: string };
type Detail = { section: string; label: string; description: string };
const details: Record<string, Detail> = {};
function section(group: string, title: string, rows: [string, string, string?][]) {
  for (const [key, label, help] of rows) {
    details[`${group}.${key}`] = {
      section: title,
      label,
      description: help ?? `Shown in the ${title.toLowerCase()} section.`,
    };
  }
}

section('home', 'Welcome banner', [
  ['div.52', 'Introductory badge', 'A short phrase above the main headline.'],
  ['h1.53', 'Main headline', 'The first line visitors read on the home page.'],
  ['h1.54', 'Headline second line', 'Text before the highlighted phrase, for example “With”.'],
  ['span.55', 'Highlighted headline', 'The emphasized phrase at the end of the headline.'],
  ['p.56', 'Welcome description', 'Explain what your business offers in one or two sentences.'],
  ['Link.58', 'Primary button text'], ['to.57', 'Primary button destination'],
  ['Link.60', 'Login button text'], ['to.59', 'Login button destination'],
  ['Link.62', 'Support link text'], ['to.61', 'Support link destination'],
  ['src.71', 'Welcome banner image', 'Choose the main illustration beside your welcome headline.'],
  ['alt.72', 'Welcome image description', 'Describe the image for visitors using screen readers.'],
]);
section('home', 'Welcome highlights', [
  ['strong.63', 'Recharge highlight heading'], ['span.64', 'Recharge highlight description'],
  ['strong.65', 'Wallet highlight heading'], ['span.66', 'Wallet highlight description'],
  ['strong.67', 'Reports highlight heading'], ['span.68', 'Reports highlight description'],
  ['strong.69', 'Teams highlight heading'], ['span.70', 'Teams highlight description'],
]);
section('home', 'Illustration badges', [
  ['small.73', 'Payments badge top label'], ['strong.74', 'Payments badge heading'], ['span.75', 'Payments badge description'],
  ['small.76', 'Wallet badge top label'], ['strong.77', 'Wallet badge heading'], ['span.78', 'Wallet badge description'],
  ['div.79', 'Access badge text'],
]);
section('home', 'Services introduction', [
  ['span.80', 'Services section badge'], ['h2.81', 'Services section heading'],
  ['p.82', 'Services section description'], ['to.83', 'Service cards destination', 'All service cards open this page when clicked.'],
]);
for (const [index, name] of ['Prepaid recharge', 'Postpaid bill', 'DTH recharge', 'Electricity', 'Bill payments', 'Wallet transfers'].entries()) {
  const start = 1 + index * 3;
  section('home', `${name} service card`, [
    [`title.${start}`, `${name} card title`, 'A short service name displayed below its image.'],
    [`image.${start + 1}`, `${name} image`, 'Upload an illustration or icon for this service.'],
    [`color.${start + 2}`, `${name} background color`, 'The background behind this service image.'],
  ]);
}
section('home', 'Why choose us introduction', [
  ['span.84', 'Benefits section badge'], ['h2.85', 'Benefits section heading'], ['p.86', 'Benefits section description'],
  ['Link.88', 'Benefits button text'], ['to.87', 'Benefits button destination'],
]);
for (const [index, name] of ['Recharge processing', 'Secure access', 'Commissions', 'Reports', 'Business network', 'Business identity'].entries()) {
  const start = 19 + index * 3;
  section('home', `${name} benefit card`, [
    [`title.${start}`, `${name} benefit title`],
    [`text.${start + 1}`, `${name} benefit description`, 'Describe this benefit in one short sentence.'],
    [`color.${start + 2}`, `${name} icon color`, 'The accent color used for this benefit icon.'],
  ]);
}
section('home', 'Business roles introduction', [
  ['span.89', 'Business roles section badge'], ['h2.90', 'Business roles section heading'],
  ['roleJoin', 'Join role button text', 'Shared button text for the Retailer and Distributor cards.'],
  ['roleContact', 'Business owner button text'],
]);
for (const [index, name] of ['Retailer', 'Distributor', 'Business owner'].entries()) {
  const start = 37 + index * 5;
  section('home', `${name} role card`, [
    [`title.${start}`, `${name} role title`], [`text.${start + 1}`, `${name} role description`],
    [`highlight.${start + 2}`, `${name} feature highlight`], [`caption.${start + 3}`, `${name} short caption`],
    [`to.${start + 4}`, `${name} button destination`],
  ]);
}
section('home', 'Closing invitation', [
  ['h2.91', 'Closing invitation heading'], ['p.92', 'Closing invitation description'],
  ['Link.94', 'Account request button text'], ['to.93', 'Account request button destination'],
  ['Link.96', 'Sales button text'], ['to.95', 'Sales button destination'],
]);

section('about', 'Page introduction', [
  ['h1.9', 'About page title'], ['p.10', 'About page introduction'],
]);
section('about', 'Company story', [
  ['h2.11', 'Company story heading'],
  ['p.12', 'Company story opening paragraph', 'This paragraph follows your business name. Start with a verb, for example “brings recharge services…”.'],
  ['p.13', 'Company story second paragraph', 'Explain your services, values, and how you support customers.'],
]);
for (const [index, name] of ['Speed', 'Security', 'Connectivity', 'Transparency'].entries()) {
  const start = 1 + index * 2;
  section('about', `${name} highlight`, [[`title.${start}`, `${name} highlight title`], [`description.${start + 1}`, `${name} highlight description`]]);
}
section('contact', 'Page introduction', [
  ['h1.1', 'Contact page title'],
  ['p.2', 'Introduction before business name', 'The introduction displays this text, your business name, then the following text.'],
  ['p.3', 'Introduction after business name'],
]);
section('contact', 'Business contact panel', [
  ['p.4', 'Contact panel introduction', 'Actual address, phone and email are edited under Brand & contact details.'],
  ['h3.5', 'Address heading'], ['h3.6', 'Phone heading'],
  ['p.7', 'Message when phone is unavailable', 'Shown only if no support phone number is saved.'],
  ['h3.8', 'Email heading'], ['p.9', 'Message when email is unavailable', 'Shown only if no support email is saved.'],
]);
section('contact', 'Contact form', [
  ['h2.10', 'Contact form heading'], ['label.11', 'Name field label'], ['placeholder.12', 'Name field example'],
  ['label.13', 'Email field label'], ['placeholder.14', 'Email field example'],
  ['label.15', 'Message field label'], ['placeholder.16', 'Message field example'],
  ['button.17', 'Contact form button text', 'This button opens an email draft; it does not submit directly to a support inbox.'],
  ['p.18', 'Email draft notice before address', 'Shown after opening a draft, followed by your support email address.'],
  ['p.19', 'Email draft notice after address'],
]);
for (const group of ['terms', 'privacy']) {
  const isTerms = group === 'terms';
  section(group, 'Page heading and update date', [
    [`h1.${isTerms ? 11 : 9}`, isTerms ? 'Terms page title' : 'Privacy page title'],
    [`p.${isTerms ? 12 : 10}`, 'Last updated label'],
    [`dateTime.${isTerms ? 13 : 11}`, 'Last updated date', 'Choose the effective date; the displayed date is formatted automatically.'],
    [`time.${isTerms ? 14 : 12}`, 'Formatted update date'],
  ]);
  const names = isTerms ? ['Acceptance of terms', 'Services', 'Account responsibilities', 'Wallet and transactions', 'Limitation of liability'] : ['Information collected', 'Use of information', 'Data security', 'Cookies'];
  for (const [index, name] of names.entries()) section(group, `Section ${index + 1}: ${name}`, [
    [`title.${1 + index * 2}`, `Section ${index + 1} heading`],
    [`text.${2 + index * 2}`, `Section ${index + 1} paragraph`, 'Write the policy text for this section. Use {{brand}} to insert the business name.'],
  ]);
}
section('privacy', 'Section 5: Contact', [
  ['h2.13', 'Contact section heading', 'Include the section number, for example “5. Contact”.'],
  ['p.14', 'Privacy contact introduction', 'Text shown immediately before the Contact page link.'],
  ['Link.16', 'Privacy contact link text'], ['to.15', 'Privacy contact link destination'],
]);
section('navigation', 'Main navigation links', [
  ['label.2', 'Home menu text'], ['to.1', 'Home menu destination'],
  ['label.4', 'About menu text'], ['to.3', 'About menu destination'],
  ['label.6', 'Contact menu text'], ['to.5', 'Contact menu destination'],
  ['label.8', 'Terms menu text'], ['to.7', 'Terms menu destination'],
]);
section('navigation', 'Logo and accessibility', [
  ['to.10', 'Header logo destination'], ['a.9', 'Skip navigation link text', 'Keyboard shortcut link that jumps to the page content.'],
]);
section('navigation', 'Desktop account buttons', [
  ['Link.16', 'Desktop login button text'], ['to.15', 'Desktop login destination'],
  ['Link.18', 'Desktop account request button text'], ['to.17', 'Desktop account request destination'],
]);
section('navigation', 'Mobile account buttons', [
  ['Link.12', 'Mobile login button text'], ['to.11', 'Mobile login destination'],
  ['Link.14', 'Mobile account request button text'], ['to.13', 'Mobile account request destination'],
]);
section('footer', 'Business introduction', [
  ['to.1', 'Footer logo destination'], ['p.3', 'Footer business description', 'A short summary of your business beneath the logo.'],
]);
section('footer', 'Services column', [
  ['h3.4', 'Services column heading'], ['service.5', 'First service name'], ['service.6', 'Second service name'],
  ['service.7', 'Third service name'], ['service.8', 'Fourth service name'], ['to.9', 'Footer services destination'],
]);
section('footer', 'Company links', [
  ['h3.10', 'Company column heading'], ['Link.12', 'About footer link text'], ['to.11', 'About footer link destination'],
  ['Link.14', 'Contact footer link text'], ['to.13', 'Contact footer link destination'],
  ['Link.16', 'Terms footer link text'], ['to.15', 'Terms footer link destination'],
  ['Link.18', 'Privacy footer link text'], ['to.17', 'Privacy footer link destination'],
]);
section('footer', 'Account invitation', [
  ['h3.19', 'Footer invitation heading'], ['p.20', 'Footer invitation description'],
  ['text.23', 'Footer account request button text', 'Shown on the Home, Terms, and Privacy pages.'], ['text.21', 'Footer account request destination'],
  ['text.24', 'Footer login button text', 'Shown on the About and Contact pages.'], ['text.22', 'Footer login destination'],
]);
section('footer', 'Support panel', [
  ['div.25', 'Footer support heading'], ['Link.27', 'Footer support link text'], ['to.26', 'Footer support destination'],
]);
section('footer', 'Copyright and legal links', [
  ['p.28', 'Copyright symbol', 'Text before the automatically generated year and business name.'],
  ['p.29', 'Copyright closing text', 'Text after the year and business name.'],
  ['Link.31', 'Bottom terms link text'], ['to.30', 'Bottom terms destination'],
  ['Link.33', 'Bottom privacy link text'], ['to.32', 'Bottom privacy destination'],
]);
section('auth', 'Login introduction', [
  ['text.3', 'Login welcome heading', 'Shown before the business name on the login page.'],
  ['text.5', 'Login welcome description'],
]);
section('auth', 'Registration introduction', [
  ['text.2', 'Registration welcome heading', 'Shown before the business name on the account request page.'],
  ['text.4', 'Registration welcome description'],
]);
section('auth', 'Shared features', [
  ['to.1', 'Login and registration logo destination'],
  ['li.6', 'First feature'], ['li.7', 'Second feature'], ['li.8', 'Third feature'], ['li.9', 'Fourth feature'],
]);
section('auth', 'Audience summary', [
  ['small.10', 'Audience introductory text'], ['strong.11', 'Audience heading'], ['span.12', 'Audience description'],
]);

export const derivedDateFields = new Set(['terms.time.14', 'privacy.time.12']);
export function presentWebsiteFields(fields: readonly Field[], defaults: Record<string, string>) {
  const order = new Map(Object.keys(details).map((key, index) => [key, index]));
  return fields.map(field => {
    const detail = details[field.key];
    if (!detail) throw new Error(`Missing website editor guidance: ${field.key}`);
    const guidance = field.type === 'link' ? `${detail.description} Choose the page visitors should open when they click this link or button.`
      : field.type === 'color' ? `${detail.description} Choose a color using the color picker.` : detail.description;
    return { ...field, ...detail, description: guidance, placeholder: field.type === 'text' ? defaults[field.key]?.slice(0, 150) : undefined };
  }).sort((a, b) => order.get(a.key)! - order.get(b.key)!);
}
export function withFormattedDates(values: Record<string, string>) {
  const result = { ...values };
  for (const [source, target] of [['terms.dateTime.13', 'terms.time.14'], ['privacy.dateTime.11', 'privacy.time.12']] as const) {
    const value = result[source];
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) result[target] = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
  }
  return result;
}
