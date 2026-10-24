import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Link, usePathname y useRouter que conservan el idioma actual.
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
