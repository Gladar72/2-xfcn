import { expect, test, type Page } from "@playwright/test";

const person = (n: number, name: string, city = "Тюмень") => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, name, city, age: 28, avatarUrl: "/brand/covers/walk.webp", photos: ["/brand/covers/walk.webp"], sharedInterests: [], interests: [], bio: "Люблю прогулки", ratingAvg: 5, completedMeetingsCount: 2, distanceM: 700 });
const anna = person(1,"Анна"), boris = person(2,"Борис"), maria = person(3,"Мария","Москва");
const coffee = {id:"00000000-0000-4000-8000-000000000101",name:"Кофе"};
const interests=[coffee,...["Кино","Бег","Путешествия","Музыка","Йога","Лыжи и сноуборд","Прогулки с собакой","Поездки на выходные","Настольные игры"].map((name,i)=>({id:`00000000-0000-4000-8000-${String(102+i).padStart(12,"0")}`,name}))];
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
    const items = url.searchParams.get("ageMin") === "60" ? [] : city === "Москва" ? [maria] : city !== "Тюмень" ? [] : gender === "male" ? [boris] : gender === "female" ? [anna] : [anna,boris];
    const json = url.pathname === "/api/people" ? { items, city, meHasLocation: true, nextOffset: null }
      : url.pathname.startsWith("/api/users/") ? [anna,boris,maria].find(p=>url.pathname.endsWith(p.id))
      : url.pathname === "/api/interests" ? { interests }
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

async function filterGender(page:Page, name:string) {
  await page.getByRole("button",{name:"Фильтры",exact:true}).tap();
  await page.getByRole("button",{name,exact:true}).tap();
  await page.getByRole("button",{name:"Показать анкеты",exact:true}).tap();
}

test("compact filter applies gender only on submit; cancel preserves the previous selection",async({page})=>{
  await setup(page); await page.goto("/people?city=Тюмень");
  await expect(active(page).locator("h1")).toHaveText("Анна, 28");
  await expect(page.getByRole("button",{name:"Выбрать город",exact:true})).toHaveCount(0);
  await expect(page.getByText("Весь город",{exact:false})).toHaveCount(0);
  await filterGender(page,"Мужчины");
  await expect(active(page).locator("h1")).toHaveText("Борис, 28");
  await page.getByRole("button",{name:"Фильтры",exact:true}).tap();
  await expect(page.getByRole("button",{name:"Мужчины",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Женщины",exact:true}).tap();
  await expect(active(page).locator("h1")).toHaveText("Борис, 28");
  await page.getByRole("button",{name:"Закрыть фильтры",exact:true}).tap();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Фильтры",exact:true}).tap();
  await expect(page.getByRole("button",{name:"Мужчины",exact:true})).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Женщины",exact:true}).tap();
  await page.getByRole("button",{name:"Показать анкеты",exact:true}).tap();
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
    await filterGender(page,"Мужчины"); await expect.poll(()=>requested).toBe(true);
    await filterGender(page,"Женщины"); await expect(active(page).locator("h1")).toHaveText("Анна, 28");
    release(); expect(new URL(page.url()).searchParams.get("gender")).toBe("female");
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
  await expect(active(page).locator(".nm")).toContainText("Москва");
  await expect(page.getByRole("button",{name:"Выбрать город",exact:true})).toHaveCount(0);
});

test("age and branded interests fit narrow screens, apply together and reset from the empty state",async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await setup(page); await page.goto("/people?city=Тюмень");
  await expect(active(page).locator("h1")).toHaveText("Анна, 28");
  await page.getByRole("button",{name:"Фильтры",exact:true}).tap();
  const dialog=page.getByRole("dialog",{name:"Фильтры людей"});
  await expect(dialog).toBeVisible();
  await page.getByRole("textbox",{name:"Возраст от",exact:true}).fill("60");
  await page.getByRole("textbox",{name:"Возраст до",exact:true}).fill("50");
  await expect(page.getByRole("button",{name:"Показать анкеты",exact:true})).toBeDisabled();
  await page.getByRole("textbox",{name:"Возраст до",exact:true}).fill("65");
  await page.getByRole("textbox",{name:"Возраст до",exact:true}).blur();
  await page.getByRole("button",{name:/^Все интересы/}).tap();
  await page.getByPlaceholder("Найти интерес").fill("собакой");
  const long=dialog.getByRole("button",{name:"Прогулки с собакой",exact:true});
  await expect(long).toBeVisible();
  expect(await long.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  await page.getByPlaceholder("Найти интерес").fill("Кофе");
  await dialog.getByRole("button",{name:"Кофе",exact:true}).tap();
  await expect(dialog.locator('.it img')).toHaveAttribute('src','/brand/cat3d/i_kofe.webp');
  await page.getByRole("button",{name:/^Готово/}).tap();
  await expect(page.getByRole("button",{name:"Показать анкеты",exact:true})).toBeInViewport();
  await page.getByRole("button",{name:"Показать анкеты",exact:true}).tap();
  await expect(page.getByRole("button",{name:"Сбросить фильтры",exact:true})).toBeInViewport();
  const query=new URL(page.url()).searchParams;
  expect(query.get("city")).toBe("Тюмень"); expect(query.get("ageMin")).toBe("60"); expect(query.get("ageMax")).toBeNull(); expect(query.get("interests")).toBe(coffee.id);
  await page.getByRole("button",{name:"Сбросить фильтры",exact:true}).tap();
  await expect(active(page).locator("h1")).toHaveText("Анна, 28");
  expect(new URL(page.url()).searchParams.get("interests")).toBeNull();
});

test("profile menu remains tappable and the filter backdrop closes with a single tap",async({page})=>{
  await setup(page); await page.goto("/people?city=Тюмень");
  await expect(active(page).locator("h1")).toHaveText("Анна, 28");
  await page.getByRole("button",{name:"Меню профиля",exact:true}).tap();
  await expect(page.getByRole("button",{name:"Заблокировать",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Отмена",exact:true}).tap();
  await page.getByRole("dialog").waitFor({state:"hidden"});
  await page.getByRole("button",{name:"Фильтры",exact:true}).tap();
  await page.getByRole("textbox",{name:"Возраст от",exact:true}).fill("35");
  await page.getByRole("button",{name:"Закрыть: Фильтры людей",exact:true}).tap({position:{x:10,y:10}});
  await page.getByRole("dialog").waitFor({state:"hidden"});
  await expect(page.getByRole("button",{name:"Фильтры",exact:true})).toBeInViewport();
  expect(new URL(page.url()).searchParams.get("ageMin")).toBeNull();
});

test("home requests use a fresh seed after reload and a city-scoped selection",async({page})=>{
  await setup(page); const requests:URL[]=[];
  page.on("request",r=>{const u=new URL(r.url());if(u.pathname==="/api/people")requests.push(u);});
  await page.goto("/feed"); await expect(page.locator(".pcard").first()).toBeVisible();
  const first=requests.at(-1)!.searchParams.get("seed"); expect(first).toBeTruthy();
  await page.reload(); await expect(page.locator(".pcard").first()).toBeVisible();
  expect(requests.at(-1)!.searchParams.get("seed")).not.toBe(first);
  expect(requests.every(u=>u.searchParams.get("city")==="Тюмень")).toBe(true);
});

test("approved filter layout uses real brand icons and Golos",async({page},testInfo)=>{
  await setup(page); await page.setViewportSize({width:390,height:844});
  await page.goto("/people?city=Тюмень"); await expect(active(page).locator("h1")).toHaveText("Анна, 28");
  await page.getByRole("button",{name:"Фильтры",exact:true}).tap();
  await expect(page.getByRole("button",{name:"Кофе",exact:true})).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  const sheet=page.getByRole("dialog",{name:"Фильтры людей"});
  await expect(sheet).toHaveCSS("font-family",/golos/i);
  await sheet.locator("img").evaluateAll(images=>Promise.all(images.map(i=>(i as HTMLImageElement).decode())));
  await expect(page.getByRole("button",{name:/^Все интересы/})).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath("people-filter.png")});
  await page.getByRole("button",{name:/^Все интересы/}).tap();
  await page.screenshot({path:testInfo.outputPath("people-interests.png")});
});
