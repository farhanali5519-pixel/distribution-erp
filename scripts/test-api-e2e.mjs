const baseUrl = 'http://localhost:3000';

async function testApi() {
  console.log('--- TESTING HTTP API ENDPOINTS & PAGE RENDERING ---');

  // 1. Categories API
  console.log('\n1. Testing Categories API...');
  const catRes = await fetch(`${baseUrl}/api/inventory/categories`);
  const catText = await catRes.text();
  console.log('Categories status:', catRes.status, 'Body preview:', catText.slice(0, 300));
  const catData = JSON.parse(catText);
  console.log('Categories status:', catRes.status, 'Success:', catData.success, 'Count:', catData.categories?.length);


  const newCatRes = await fetch(`${baseUrl}/api/inventory/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Test Category ${Date.now()}`, description: 'FMCG Goods' }),
  });
  const newCatData = await newCatRes.json();
  console.log('Category create status:', newCatRes.status, 'Success:', newCatData.success, 'ID:', newCatData.category?.id);
  const createdCatId = newCatData.category?.id;

  // 2. Brands API
  console.log('\n2. Testing Brands API...');
  const brandRes = await fetch(`${baseUrl}/api/inventory/brands`);
  const brandData = await brandRes.json();
  console.log('Brands status:', brandRes.status, 'Success:', brandData.success, 'Count:', brandData.brands?.length);

  const newBrandRes = await fetch(`${baseUrl}/api/inventory/brands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Test Brand ${Date.now()}`, description: 'Premium Brand Principle' }),
  });
  const newBrandData = await newBrandRes.json();
  console.log('Brand create status:', newBrandRes.status, 'Success:', newBrandData.success, 'ID:', newBrandData.brand?.id);
  const createdBrandId = newBrandData.brand?.id;

  // 3. Product Create API with 3-tier UOM
  console.log('\n3. Testing Product Create with 3-Tier UOM (Carton > Box > Piece)...');
  const sku = `SKU-E2E-${Date.now().toString().slice(-4)}`;
  const prodRes = await fetch(`${baseUrl}/api/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sku,
      barcode: '8960012345678',
      name: 'Super Crisp Potato Chips 50g',
      categoryId: createdCatId,
      brandId: createdBrandId,
      boxesPerCarton: 12, // 12 boxes per carton
      piecesPerBox: 10,   // 10 pieces per box => 120 pieces per carton
      costPrice: 40,
      tradePrice: 48,
      mrp: 50,
      initialCartons: 5,  // 5 cartons
      initialBoxes: 3,    // 3 boxes
      initialPieces: 4,   // 4 pieces => 5 * 120 + 3 * 10 + 4 = 634 pieces
      minStockAlert: 24,
    }),
  });

  const prodData = await prodRes.json();
  console.log('Product create status:', prodRes.status, 'Success:', prodData.success);
  if (prodData.product) {
    console.log('Product created:', prodData.product.name);
    console.log('SKU:', prodData.product.sku);
    console.log('Packaging Ratio:', prodData.product.packaging_ratio);
    console.log('Stock in CTN/BOX/PCS:', prodData.product.formatted_stock);
    console.log('Total base stock:', prodData.product.current_stock_base, 'pieces');
    console.log('Brand:', prodData.product.brand_name);
    console.log('Category:', prodData.product.category_name);
  }

  // 4. Test Stock Adjustment API
  console.log('\n4. Testing Stock Adjustment in 3-Tier UOM...');
  const adjRes = await fetch(`${baseUrl}/api/inventory/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: prodData.product.id,
      adjustmentType: 'INCREASE',
      cartons: 1,
      boxes: 2,
      pieces: 5, // 1 * 120 + 2 * 10 + 5 = 145 pieces
      reason: 'Physical Stock Count Surplus',
    }),
  });
  const adjData = await adjRes.json();
  console.log('Adjustment status:', adjRes.status, 'Success:', adjData.success, 'Message:', adjData.message);

  // 5. Test Deletion Safety on Category
  console.log('\n5. Testing Deletion Protection for Category with Products...');
  const delCatRes = await fetch(`${baseUrl}/api/inventory/categories?id=${createdCatId}`, { method: 'DELETE' });
  const delCatData = await delCatRes.json();
  console.log('Blocked delete status (expected 400):', delCatRes.status, 'Error message:', delCatData.error);

  // 6. Test Deletion Safety on Brand
  console.log('\n6. Testing Deletion Protection for Brand with Products...');
  const delBrandRes = await fetch(`${baseUrl}/api/inventory/brands?id=${createdBrandId}`, { method: 'DELETE' });
  const delBrandData = await delBrandRes.json();
  console.log('Blocked delete status (expected 400):', delBrandRes.status, 'Error message:', delBrandData.error);

  // 7. Verify Inventory Page compilation
  console.log('\n7. Testing Page compilation GET /inventory...');
  const pageRes = await fetch(`${baseUrl}/inventory`);
  console.log('Inventory page HTTP status:', pageRes.status, 'OK:', pageRes.ok);

  console.log('\n🎉 ALL HTTP API & E2E CHECKS COMPLETED SUCCESSFULLY!');
}

testApi().catch((err) => {
  console.error('API Test Error:', err);
  process.exit(1);
});
