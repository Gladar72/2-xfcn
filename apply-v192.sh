sed -i.bak 's/    title: input.title,/    title: input.title ?? "",/' app/api/events/route.ts
rm -f app/api/events/route.ts.bak
