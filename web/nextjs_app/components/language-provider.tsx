'use client';

import { useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_LANGUAGE, LANGUAGE_EVENT, LANGUAGE_STORAGE_KEY, normalizeLanguage, translateText } from '../lib/i18n';

export function LanguageProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let active = true;
    const originalText = new WeakMap<Text, string>();
    const originalAttributes = new WeakMap<HTMLElement, Map<string, string>>();
    const applyLanguage = (raw: unknown) => {
      const language = normalizeLanguage(raw);
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      const visit = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const textNode = node as Text;
          if (!originalText.has(textNode)) originalText.set(textNode, textNode.textContent ?? '');
          const original = originalText.get(textNode) ?? '';
          const trimmed = original.trim();
          if (trimmed) textNode.textContent = original.replace(trimmed, translateText(trimmed, language));
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as HTMLElement;
        let attributes = originalAttributes.get(element);
        if (!attributes) { attributes = new Map<string, string>(); originalAttributes.set(element, attributes); }
        for (const attribute of ['placeholder', 'title', 'aria-label']) {
          const current = element.getAttribute(attribute);
          if (current !== null) {
            if (!attributes.has(attribute)) attributes.set(attribute, current);
            element.setAttribute(attribute, translateText(attributes.get(attribute) ?? current, language));
          }
        }
        node.childNodes.forEach(visit);
      };
      visit(document.body);
    };
    const loadLanguage = async () => {
      let language = normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? DEFAULT_LANGUAGE);
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        language = normalizeLanguage(data.user?.user_metadata?.preferred_language ?? language);
      }
      if (active) applyLanguage(language);
    };
    void loadLanguage();
    const onLanguageChange = (event: Event) => applyLanguage((event as CustomEvent<string>).detail);
    const observer = new MutationObserver((records) => {
      const language = normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
      for (const record of records) record.addedNodes.forEach((node) => {
        const visitNew = (item: Node) => {
          if (item.nodeType === Node.TEXT_NODE) {
            const textNode = item as Text;
            if (!originalText.has(textNode)) originalText.set(textNode, textNode.textContent ?? '');
            const original = originalText.get(textNode) ?? '';
            const trimmed = original.trim();
            if (trimmed) textNode.textContent = original.replace(trimmed, translateText(trimmed, language));
          } else item.childNodes?.forEach(visitNew);
        };
        visitNew(node);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener(LANGUAGE_EVENT, onLanguageChange);
    return () => { active = false; observer.disconnect(); window.removeEventListener(LANGUAGE_EVENT, onLanguageChange); };
  }, []);
  return <>{children}</>;
}
