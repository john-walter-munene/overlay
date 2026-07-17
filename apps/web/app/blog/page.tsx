import { redirect } from 'next/navigation';

/**
 * The old "Blog" is now split into Content (guides) and News. Keep this route
 * as a redirect so existing links / bookmarks land on the Content hub. Article
 * detail pages remain at /blog/[slug].
 */
export default function BlogIndexRedirect() {
  redirect('/content');
}
