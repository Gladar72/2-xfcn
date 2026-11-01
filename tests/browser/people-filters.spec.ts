import { expect, test, type Page } from "@playwright/test";

const person = (n: number, name: string, city = "Тюмень") => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, name, city, age: 28, avatarUrl: "/brand/covers/walk.webp", photos: ["/brand/covers/walk.webp"], sharedInterests: [], interests: [], bio: "Люблю прогулки", ratingAvg: 5, completedMeetingsCount: 2, distanceM: 700 });
const anna = person(1,"Анна"), boris = person(2,"Борис"), maria = person(3,"Мария","Москва");
const active = (page: Page) => page.locator('section[data-id="person"]:not(.ghost)');
async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["deck","feed"] }));
    Object.defineProperty(navigator,"permissions",{configurable:true,value:{query:async()=>({state:"denied"})}});
  });
  await page.route("**/api/**", r => {
    const url = new URL(r.request().url());
    const city = url.searchParams.get("city") ?? "Тюмень";
    const gender = url.searchParams.get("gender");
    const items = city === "Москва" ? [maria] : city !== "Тюмень" ? [] : gender === "male" ? [boris] : gender === "female" ? [anna] : [anna,boris];
    const json = url.pathname === "/api/people" ? { items, city, meHasLocation: true, nextOffset: null }
      : url.pathname.startsWith("/api/users/") ? [anna,boris,maria].find(p=>url.pathname.endsWith(p.id))
      : url.pathname === "/api/me/profile" ? { city: "Тюмень" }
      : url.pathname === "/api/categories" ? { categories: [], trainingTypes: [] } : {items:[]};
    return r.fulfill({json});
  });
}
async function pickCity(page: Page, city: string) {
  await page.getByPlaceholder("Найти город").fill(city);
  await page.getByRole("button",{name:`Выбрать · ${city}`,exact:true}).tap();
}
async function swipe(page: Page) {
  const body=active(page).locator(".body");
  await body.dispatchEvent("touchstart",{touches:[{identifier:0,clientX:280,clientY:300}]});
  await body.dispatchEvent("touchmove",{touches:[{identifier:0,clientX:80,clientY:300}]});
  await body.dispatchEvent("touchend",{touches:[],changedTouches:[{identifier:0,clientX:80,clientY:300}]});
}

test("city and gender controls switch the actual profiles and remain available in an empty city",async({page})=>{
  await setup(page); await page.goto("/people?city=Тюмень");
  await expect(active(page).locator("h1")).toHaveText("Анна, 28");
  await page.getByRole("button",{name:"Мужчины",exact:true}).tap();
  await expect(active(page).locator("h1")).toHaveText("Борис, 28");
  await expect(page.getByRole("button",{name:"Мужчины",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Женщины",exact:true}).tap();
  await expect(active(page).locator("h1")).toHaveText("Анна, 28");
  await page.getByRole("button",{name:"Выбрать город",exact:true}).tap(); await pickCity(page,"Москва");
  await expect(active(page).locator("h1")).toHaveText("Мария, 28");
  expect(new URL(page.url()).searchParams.get("gender")).toBe("female");
  await page.getByRole("button",{name:"Выбрать город",exact:true}).tap(); await pickCity(page,"Казань");
  await expect(page.getByRole("button",{name:"Сменить город",exact:true})).toBeVisible();
  await expect(active(page)).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Выбрать город",exact:true})).toBeInViewport();
  await page.getByRole("button",{name:"Сменить город",exact:true}).tap(); await pickCity(page,"Тюмень");
  await expect(active(page).locator("h1")).toHaveText("Анна, 28");
});

test("a delayed response from the previous gender cannot replace the latest selection",async({page})=>{
  await setup(page); let release=()=>{}; const pending=new Promise<void>(r=>{release=r}); let requested=false;
  await page.route("**/api/people?**",async r=>{
    const u=new URL(r.request().url());
    if(u.searchParams.get("gender")==="male"){requested=true;await pending;return r.fulfill({json:{items:[boris],city:"Тюмень"}}).catch(()=>{});}
    return r.fulfill({json:{items:[anna],city:"Тюмень",meHasLocation:true}});
  });
  try {
    await page.goto("/people?city=Тюмень"); await expect(active(page).locator("h1")).toHaveText("Анна, 28");
    await page.getByRole("button",{name:"Мужчины",exact:true}).tap(); await expect.poll(()=>requested).toBe(true);
    await page.getByRole("button",{name:"Женщины",exact:true}).tap(); await expect(active(page).locator("h1")).toHaveText("Анна, 28");
    release(); await expect(page.getByRole("button",{name:"Женщины",exact:true})).toHaveAttribute("aria-pressed","true");
  } finally {release();}
});

test("pagination retries the same page without losing filters or replacing the selected profile",async({page})=>{
  await setup(page); let fail=true; const requests:URL[]=[];
  await page.route("**/api/people?**",r=>{
    const u=new URL(r.request().url()); requests.push(u);
    if(u.searchParams.get("offset")==="2") return r.fulfill(fail?{status:503,json:{error:"unavailable"}}:{json:{items:[maria],city:"Тюмень",meHasLocation:true,nextOffset:null}});
    return r.fulfill({json:{items:[anna,boris],city:"Тюмень",meHasLocation:true,nextOffset:2}});
  });
  await page.goto(`/people?city=Тюмень&gender=female&start=${anna.id}`);
  await expect(active(page).locator("h1")).toHaveText("Анна, 28");
  await expect.poll(()=>requests.some(u=>u.searchParams.get("offset")==="2")).toBe(true);
  await swipe(page); await expect(active(page).locator("h1")).toHaveText("Борис, 28");
  await swipe(page); await expect(page.getByRole("button",{name:"Загрузить ещё",exact:true})).toBeVisible();
  fail=false; await page.getByRole("button",{name:"Загрузить ещё",exact:true}).tap();
  await expect(active(page).locator("h1")).toHaveText("Мария, 28");
  for(const u of requests){expect(u.searchParams.get("city")).toBe("Тюмень");expect(u.searchParams.get("gender")).toBe("female");expect(u.searchParams.get("start")).toBe(anna.id);}
  await swipe(page); await expect(page.getByText("Ты посмотрел всех по выбранным фильтрам.",{exact:false})).toBeVisible();
});

test("changing the home city refreshes people and opens the selected person in that city",async({page})=>{
  await setup(page); await page.goto("/feed");
  await expect(page.locator(".pcard").first()).toContainText("Анна");
  await page.locator("button.loc").tap(); await pickCity(page,"Москва");
  await expect(page.locator(".pcard")).toHaveCount(1); await expect(page.locator(".pcard")).toContainText("Мария");
  await page.locator(".pcard").tap(); await expect(active(page).locator("h1")).toHaveText("Мария, 28");
  expect(new URL(page.url()).searchParams.get("city")).toBe("Москва");
  await expect(page.locator(".people-city")).toContainText("Москва");
});
