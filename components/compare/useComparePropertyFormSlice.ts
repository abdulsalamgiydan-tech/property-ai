"use client";

import type { AnalysePropertyFormFields } from "@/lib/analysePropertyForm";
import { formatInputNumber } from "@/lib/formatCurrency";
import { getSuggestedAssumptionsForSuburb } from "@/lib/suburbAssumptions";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

export type ComparePropertyFormSnapshot = {
  suburb: string;
  propertyAddress: string;
  state: string;
  suburbGrowthPercent: string;
  vacancyPercent: string;
  purchasePrice: string;
  weeklyRent: string;
  rentalGrowthRate: string;
  interestRate: string;
  isInterestOnly: boolean;
  loanTermYears: string;
  depositPercent: string;
  annualExpenses: string;
  expensesGrowthRate: string;
  pmFeePercent: string;
  preTaxSalary: string;
  yearBuilt: string;
  buildingValuePercent: string;
  fixturesEstimate: string;
};

const DEFAULT_SNAPSHOT: ComparePropertyFormSnapshot = {
  suburb: "",
  propertyAddress: "",
  state: "QLD",
  suburbGrowthPercent: "5",
  vacancyPercent: "2",
  purchasePrice: "550,000",
  weeklyRent: "520",
  rentalGrowthRate: "3",
  interestRate: "6.2",
  isInterestOnly: false,
  loanTermYears: "30",
  depositPercent: "20",
  annualExpenses: "6,500",
  expensesGrowthRate: "2.5",
  pmFeePercent: "8",
  preTaxSalary: "120,000",
  yearBuilt: "2010",
  buildingValuePercent: "80",
  fixturesEstimate: "10,000",
};

export function useComparePropertyFormSlice() {
  const [suburb, setSuburb] = useState(DEFAULT_SNAPSHOT.suburb);
  const [propertyAddress, setPropertyAddress] = useState(DEFAULT_SNAPSHOT.propertyAddress);
  const [state, setState] = useState(DEFAULT_SNAPSHOT.state);
  const [suburbGrowthPercent, setSuburbGrowthPercent] = useState(
    DEFAULT_SNAPSHOT.suburbGrowthPercent
  );
  const [vacancyPercent, setVacancyPercent] = useState(DEFAULT_SNAPSHOT.vacancyPercent);
  const [purchasePrice, setPurchasePrice] = useState(DEFAULT_SNAPSHOT.purchasePrice);
  const [weeklyRent, setWeeklyRent] = useState(DEFAULT_SNAPSHOT.weeklyRent);
  const [rentalGrowthRate, setRentalGrowthRate] = useState(DEFAULT_SNAPSHOT.rentalGrowthRate);
  const [interestRate, setInterestRate] = useState(DEFAULT_SNAPSHOT.interestRate);
  const [isInterestOnly, setIsInterestOnly] = useState(DEFAULT_SNAPSHOT.isInterestOnly);
  const [loanTermYears, setLoanTermYears] = useState(DEFAULT_SNAPSHOT.loanTermYears);
  const [depositPercent, setDepositPercent] = useState(DEFAULT_SNAPSHOT.depositPercent);
  const [annualExpenses, setAnnualExpenses] = useState(DEFAULT_SNAPSHOT.annualExpenses);
  const [expensesGrowthRate, setExpensesGrowthRate] = useState(
    DEFAULT_SNAPSHOT.expensesGrowthRate
  );
  const [pmFeePercent, setPmFeePercent] = useState(DEFAULT_SNAPSHOT.pmFeePercent);
  const [preTaxSalary, setPreTaxSalary] = useState(DEFAULT_SNAPSHOT.preTaxSalary);
  const [yearBuilt, setYearBuilt] = useState(DEFAULT_SNAPSHOT.yearBuilt);
  const [buildingValuePercent, setBuildingValuePercent] = useState(
    DEFAULT_SNAPSHOT.buildingValuePercent
  );
  const [fixturesEstimate, setFixturesEstimate] = useState(DEFAULT_SNAPSHOT.fixturesEstimate);
  const [suburbSuggestionActive, setSuburbSuggestionActive] = useState(false);

  const fieldsRef = useRef<AnalysePropertyFormFields>({} as AnalysePropertyFormFields);
  useLayoutEffect(() => {
    fieldsRef.current = {
      purchasePrice,
      weeklyRent,
      rentalGrowthRate,
      interestRate,
      depositPercent,
      annualExpenses,
      expensesGrowthRate,
      suburbGrowthPercent,
      vacancyPercent,
      preTaxSalary,
      yearBuilt,
      buildingValuePercent,
      fixturesEstimate,
      pmFeePercent,
      loanTermYears,
      suburb,
      state,
      isInterestOnly,
    };
  });

  const snapshot = useCallback((): ComparePropertyFormSnapshot => {
    return {
      suburb,
      propertyAddress,
      state,
      suburbGrowthPercent,
      vacancyPercent,
      purchasePrice,
      weeklyRent,
      rentalGrowthRate,
      interestRate,
      isInterestOnly,
      loanTermYears,
      depositPercent,
      annualExpenses,
      expensesGrowthRate,
      pmFeePercent,
      preTaxSalary,
      yearBuilt,
      buildingValuePercent,
      fixturesEstimate,
    };
  }, [
    suburb,
    propertyAddress,
    state,
    suburbGrowthPercent,
    vacancyPercent,
    purchasePrice,
    weeklyRent,
    rentalGrowthRate,
    interestRate,
    isInterestOnly,
    loanTermYears,
    depositPercent,
    annualExpenses,
    expensesGrowthRate,
    pmFeePercent,
    preTaxSalary,
    yearBuilt,
    buildingValuePercent,
    fixturesEstimate,
  ]);

  const hydrate = useCallback((s: ComparePropertyFormSnapshot) => {
    setSuburb(s.suburb);
    setPropertyAddress(s.propertyAddress);
    setState(s.state);
    setSuburbGrowthPercent(s.suburbGrowthPercent);
    setVacancyPercent(s.vacancyPercent);
    setPurchasePrice(s.purchasePrice);
    setWeeklyRent(s.weeklyRent);
    setRentalGrowthRate(s.rentalGrowthRate);
    setInterestRate(s.interestRate);
    setIsInterestOnly(s.isInterestOnly);
    setLoanTermYears(s.loanTermYears);
    setDepositPercent(s.depositPercent);
    setAnnualExpenses(s.annualExpenses);
    setExpensesGrowthRate(s.expensesGrowthRate);
    setPmFeePercent(s.pmFeePercent);
    setPreTaxSalary(s.preTaxSalary);
    setYearBuilt(s.yearBuilt);
    setBuildingValuePercent(s.buildingValuePercent);
    setFixturesEstimate(s.fixturesEstimate);
    setSuburbSuggestionActive(false);
  }, []);

  const clearSuburbSuggestion = useCallback(() => {
    setSuburbSuggestionActive(false);
  }, []);

  const applySuburbSuggestedAssumptions = useCallback(() => {
    const t = suburb.trim();
    if (!t) {
      setSuburbSuggestionActive(false);
      return;
    }
    const sug = getSuggestedAssumptionsForSuburb(t);
    if (!sug) {
      setSuburbSuggestionActive(false);
      return;
    }
    setSuburbGrowthPercent(formatInputNumber(String(sug.suburbGrowthPercent)));
    setVacancyPercent(formatInputNumber(String(sug.vacancyPercent)));
    setRentalGrowthRate(formatInputNumber(String(sug.rentalGrowthPercent)));
    setSuburbSuggestionActive(true);
  }, [suburb]);

  return {
    suburb,
    setSuburb,
    propertyAddress,
    setPropertyAddress,
    state,
    setState,
    suburbGrowthPercent,
    setSuburbGrowthPercent,
    vacancyPercent,
    setVacancyPercent,
    purchasePrice,
    setPurchasePrice,
    weeklyRent,
    setWeeklyRent,
    rentalGrowthRate,
    setRentalGrowthRate,
    interestRate,
    setInterestRate,
    isInterestOnly,
    setIsInterestOnly,
    loanTermYears,
    setLoanTermYears,
    depositPercent,
    setDepositPercent,
    annualExpenses,
    setAnnualExpenses,
    expensesGrowthRate,
    setExpensesGrowthRate,
    pmFeePercent,
    setPmFeePercent,
    preTaxSalary,
    setPreTaxSalary,
    yearBuilt,
    setYearBuilt,
    buildingValuePercent,
    setBuildingValuePercent,
    fixturesEstimate,
    setFixturesEstimate,
    suburbSuggestionActive,
    fieldsRef,
    snapshot,
    hydrate,
    clearSuburbSuggestion,
    applySuburbSuggestedAssumptions,
  };
}

export type ComparePropertyFormSlice = ReturnType<typeof useComparePropertyFormSlice>;
