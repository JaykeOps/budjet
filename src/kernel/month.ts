/** A calendar month of the Budget, written "YYYY-MM" so Months sort as strings. */
export type Month = `${number}-${number}`;

export function month(year: number, monthNumber: number): Month {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    throw new RangeError(`Not a calendar month: ${year}-${monthNumber}`);
  }
  return `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}` as Month;
}

/** The Month a calendar date ("YYYY-MM-DD", no time of day) falls in. */
export function monthOf(date: string): Month {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!match) throw new RangeError(`Not a calendar date: ${date}`);
  return month(Number(match[1]), Number(match[2]));
}

export function nextMonth(of: Month): Month {
  const [year, monthNumber] = parts(of);
  return monthNumber === 12 ? month(year + 1, 1) : month(year, monthNumber + 1);
}

export function previousMonth(of: Month): Month {
  const [year, monthNumber] = parts(of);
  return monthNumber === 1 ? month(year - 1, 12) : month(year, monthNumber - 1);
}

function parts(of: Month): [number, number] {
  const [year, monthNumber] = of.split("-").map(Number);
  return [year, monthNumber];
}
