alter table public.businesses
  add column document_terms text not null default '' check (char_length(document_terms) <= 1000),
  add column document_warranty text not null default '' check (char_length(document_warranty) <= 1000);

-- NULL uses the default. An empty string deliberately omits that section.
alter table public.jobs
  add column document_terms text check (char_length(document_terms) <= 1000),
  add column document_warranty text check (char_length(document_warranty) <= 1000);
