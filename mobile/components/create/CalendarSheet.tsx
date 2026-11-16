// «Выбрать в календаре» — как CalendarSheet мини-аппа: месяц сеткой, стрелки, «Готово».
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Sheet } from "@/components/Sheet";
import { K, KI, KRb, Press, kf } from "@/components/k";

const MN = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

export function CalendarSheet({ open, onClose, dayIndex, maxDays, onPick }: { open: boolean; onClose: () => void; dayIndex: number; maxDays: number; onPick: (i: number) => void }) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const sel = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayIndex);
  const [m, setM] = useState(0);
  useEffect(() => {
    if (open) setM((sel.getFullYear() - base.getFullYear()) * 12 + sel.getMonth() - base.getMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const y = base.getFullYear() + Math.floor((base.getMonth() + m) / 12);
  const mo = (base.getMonth() + m) % 12;
  const first = new Date(y, mo, 1);
  const off = (first.getDay() + 6) % 7;
  const n = new Date(y, mo + 1, 0).getDate();
  const lastM = Math.floor((maxDays - 1) / 30);
  const cells: (number | null)[] = [...Array.from({ length: off }, () => null), ...Array.from({ length: n }, (_, k) => k + 1)];

  return (
    <Sheet visible={open} onClose={onClose}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <View style={{ opacity: m <= 0 ? 0.3 : 1 }}>
          <KRb icon="back" size={40} onPress={() => m > 0 && setM(m - 1)} accessibilityLabel="Прошлый месяц" />
        </View>
        <Text style={kf("500", 17)}>
          {MN[mo]} {y}
        </Text>
        <View style={{ opacity: m >= lastM ? 0.3 : 1 }}>
          <KRb onPress={() => m < lastM && setM(m + 1)} size={40} accessibilityLabel="Следующий месяц">
            <KI n="chev" size={18} />
          </KRb>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
          <View key={d} style={{ width: `${100 / 7}%`, alignItems: "center", paddingVertical: 6 }}>
            <Text style={kf("500", 12, { color: K.ink3 })}>{d}</Text>
          </View>
        ))}
        {cells.map((d, k) => {
          if (d == null) return <View key={"o" + k} style={{ width: `${100 / 7}%`, height: 46 }} />;
          const dt = new Date(y, mo, d);
          const idx = Math.round((dt.getTime() - base.getTime()) / 864e5);
          const dis = idx < 0 || idx >= maxDays;
          const on = dt.getTime() === sel.getTime();
          return (
            <View key={k} style={{ width: `${100 / 7}%`, height: 46, alignItems: "center", justifyContent: "center" }}>
              <Press
                disabled={dis}
                dark={on}
                onPress={() => onPick(idx)}
                style={{ width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: on ? K.ink : "transparent", borderWidth: idx === 0 && !on ? 1 : 0, borderColor: K.ink3 }}
              >
                <Text style={kf(on ? "600" : "400", 16, { color: on ? "#fff" : dis ? "rgba(23,20,31,0.2)" : K.ink })}>{d}</Text>
              </Press>
            </View>
          );
        })}
      </View>
      <Press dark onPress={onClose} style={{ marginTop: 14, height: 54, borderRadius: 27, backgroundColor: K.ink, alignItems: "center", justifyContent: "center" }}>
        <Text style={kf("500", 16, { color: "#fff" })}>Готово</Text>
      </Press>
    </Sheet>
  );
}
