import React from 'react';
import { StockAnalysisClient } from './StockAnalysisClient';

export const metadata = {
  title: 'Stock & Booking Analysis Report',
  description: 'Comprehensive stock, booking, allocation, and route-load analysis report with multi-select filtering, custom groupings, and 3-tier packaging conversion.',
};

export default function StockAnalysisPage() {
  return <StockAnalysisClient />;
}
