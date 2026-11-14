import React from 'react';
import { SalesAnalysisClient } from './SalesAnalysisClient';

export const metadata = {
  title: 'Sales Analysis Report',
  description: 'Multi-dimensional commercial sales analysis report with multi-select filtering, custom groupings, and reconciliation.',
};

export default function SalesAnalysisPage() {
  return <SalesAnalysisClient />;
}
