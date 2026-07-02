'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package,
  Wrench,
  TrendingUp,
  Search,
  Plus,
  Edit2,
  Trash2,
  AlertTriangle,
  History,
  X,
  FileText,
  Upload,
  Calendar,
  CheckCircle,
  Clock,
  ExternalLink,
  ArrowRightLeft,
  Shirt,
  Copy,
  MapPin,
} from 'lucide-react';
import { getJson, postJson, patchJson, deleteRequest } from '../../apiClient';
import { AuthenticatedStockImage } from '@/components/AuthenticatedStockImage';
import { UniformTab } from './UniformTab';
import {
  type StockPlacement,
  type StockPlacementFormRow,
  emptyPlacementFormRow,
  formatPlacementLabel,
  parsePlacementsFromItem,
  placementFormFromApi,
  placementFormToApi,
  placementSearchBlob,
  validatePlacementsRequireBin,
} from '@/lib/stockPlacements';

function imageUploadFields(dataUrl: string, originalFilename: string, contentType: string) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (m) {
    return {
      image_base64: m[2],
      original_filename: originalFilename,
      content_type: m[1],
    };
  }
  return {
    image_base64: dataUrl,
    original_filename: originalFilename,
    content_type: contentType,
  };
}

// --- Types ---
interface StockItem {
  id: number;
  name: string;
  mpn: string | null;
  quantity: number;
  category: string;
  quality: string;
  location: string;
  locations?: StockPlacement[];
  image_url: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface StockTransaction {
  id: number;
  stock_item_id: number;
  part_id: number | null;
  job_id: number | null;
  quantity: number;
  transaction_type: 'consume' | 'reverse' | 'audit_adjust' | 'restock';
  notes: string | null;
  created_by: number;
  created_at: string;
  item_name: string;
  item_mpn: string | null;
  user_name: string;
  job_number: string | null;
}

interface Tool {
  id: number;
  name: string;
  category: string;
  quantity: number;
  status: 'available' | 'in_use' | 'missing' | 'damaged';
  location: string;
  zone?: string | null;
  aisle?: string | null;
  shelf?: string | null;
  box?: string | null;
  storage_code?: string | null;
  location_notes?: string | null;
  assigned_officer_id: number | null;
  image_url: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  assigned_officer_name?: string | null;
}

interface Officer {
  id: number;
  full_name: string;
  role_position: string | null;
  state: string;
}

interface Analytics {
  stockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  toolsCount: number;
  toolsByStatus: {
    available: number;
    in_use: number;
    missing: number;
    damaged: number;
  };
  uniformsCount?: number;
  uniformsByStatus?: {
    available: number;
    issued: number;
    retired: number;
    lost: number;
    damaged: number;
  };
  categoryStats: {
    category: string;
    total_used: number;
    current_stock: number;
  }[];
}

const DEFAULT_STOCK_CATEGORIES = ['Electrical', 'Locksmith', 'Plumbing', 'HVAC', 'General'];
const DEFAULT_TOOL_CATEGORIES = ['Power Tools', 'Hand Tools', 'Measurement', 'Safety', 'Other'];
const DEFAULT_UNIFORM_CATEGORIES = ['Jacket', 'Hi-Vis', 'PPE', 'Fire Safety', 'Footwear', 'Branded', 'Other'];
const DEFAULT_UNIFORM_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '28', '30', '32', '34', '36', '38', '40', '42', '8', '9', '10', '11', '12'];
const DEFAULT_LOCATIONS = ['Van', 'House', 'Store', 'Other'];
const QUALITIES = ['New', 'Used - Good', 'Used - Fair', 'Damaged'];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function StockToolsPage() {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [activeToken, setActiveToken] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setActiveToken(window.localStorage.getItem('wp_token'));
    }
  }, []);

  // Tabs
  const [activeTab, setActiveTab] = useState<'stock' | 'tools' | 'uniforms' | 'analytics'>('stock');

  // --- Common States ---
  const [officers, setOfficers] = useState<Officer[]>([]);

  // --- Stock States ---
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [stockSearch, setStockSearch] = useState('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState('All');
  const [stockLocationFilter, setStockLocationFilter] = useState('All');
  const [loadingStock, setLoadingStock] = useState(true);

  // --- Tools States ---
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolsSearch, setToolsSearch] = useState('');
  const [toolsCategoryFilter, setToolsCategoryFilter] = useState('All');
  const [toolsStatusFilter, setToolsStatusFilter] = useState('All');
  const [loadingTools, setLoadingTools] = useState(true);

  // --- Analytics States ---
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  // --- Modal States ---
  const [showStockModal, setShowStockModal] = useState(false);
  const [editingStockItem, setEditingStockItem] = useState<StockItem | null>(null);
  const [stockForm, setStockForm] = useState<{
    name: string;
    mpn: string;
    quantity: string;
    category: string;
    quality: string;
    location: string;
    locations: StockPlacementFormRow[];
    image_base64: string;
    original_filename: string;
    content_type: string;
  }>({
    name: '',
    mpn: '',
    quantity: '0',
    category: 'Electrical',
    quality: 'New',
    location: 'Store',
    locations: [emptyPlacementFormRow('Store')],
    image_base64: '',
    original_filename: '',
    content_type: '',
  });

  const [showToolModal, setShowToolModal] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [toolForm, setToolForm] = useState({
    name: '',
    category: 'Power Tools',
    quantity: '1',
    status: 'available' as 'available' | 'in_use' | 'missing' | 'damaged',
    location: 'Store',
    zone: '',
    aisle: '',
    shelf: '',
    box: '',
    storage_code: '',
    location_notes: '',
    assigned_officer_id: '',
    image_base64: '',
    original_filename: '',
    content_type: '',
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [stockCategories, setStockCategories] = useState<string[]>(DEFAULT_STOCK_CATEGORIES);
  const [toolCategories, setToolCategories] = useState<string[]>(DEFAULT_TOOL_CATEGORIES);
  const [uniformCategories, setUniformCategories] = useState<string[]>(DEFAULT_UNIFORM_CATEGORIES);
  const [uniformSizes, setUniformSizes] = useState<string[]>(DEFAULT_UNIFORM_SIZES);
  const [showListSettings, setShowListSettings] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [stockCategoryDraft, setStockCategoryDraft] = useState('');
  const [toolCategoryDraft, setToolCategoryDraft] = useState('');
  const [uniformCategoryDraft, setUniformCategoryDraft] = useState('');
  const [uniformSizeDraft, setUniformSizeDraft] = useState('');
  const [storageBinDraft, setStorageBinDraft] = useState('');
  const [requireBinDraft, setRequireBinDraft] = useState('Store');
  const [storageBins, setStorageBins] = useState<string[]>([]);
  const [requireBinLocations, setRequireBinLocations] = useState<string[]>(['Store']);
  const [savingListSettings, setSavingListSettings] = useState(false);
  const [copiedPlacementKey, setCopiedPlacementKey] = useState<string | null>(null);

  const [showConvertToToolModal, setShowConvertToToolModal] = useState(false);
  const [convertStockItem, setConvertStockItem] = useState<StockItem | null>(null);
  const [convertToToolQty, setConvertToToolQty] = useState('1');
  const [convertingToTool, setConvertingToTool] = useState(false);

  const [showConvertToStockModal, setShowConvertToStockModal] = useState(false);
  const [convertToolItem, setConvertToolItem] = useState<Tool | null>(null);
  const [convertToStockQty, setConvertToStockQty] = useState('1');
  const [convertToStockCategory, setConvertToStockCategory] = useState('General');
  const [convertToStockQuality, setConvertToStockQuality] = useState('Used - Good');
  const [convertingToStock, setConvertingToStock] = useState(false);

  const fetchListOptions = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{
        location_options: string[];
        stock_category_options: string[];
        tool_category_options: string[];
        uniform_category_options?: string[];
        uniform_size_options?: string[];
        storage_bin_options?: string[];
        require_bin_for_locations?: string[];
      }>('/settings/stock-tools', token);
      const locs = data.location_options?.filter((v) => v.trim().length > 0) ?? [];
      const stockCats = data.stock_category_options?.filter((v) => v.trim().length > 0) ?? [];
      const toolCats = data.tool_category_options?.filter((v) => v.trim().length > 0) ?? [];
      const uniformCats = data.uniform_category_options?.filter((v) => v.trim().length > 0) ?? [];
      const uniformSz = data.uniform_size_options?.filter((v) => v.trim().length > 0) ?? [];
      const bins = data.storage_bin_options?.filter((v) => v.trim().length > 0) ?? [];
      const requireBins = data.require_bin_for_locations?.filter((v) => v.trim().length > 0) ?? ['Store'];
      if (locs.length > 0) setLocations(locs);
      if (stockCats.length > 0) setStockCategories(stockCats);
      if (toolCats.length > 0) setToolCategories(toolCats);
      if (uniformCats.length > 0) setUniformCategories(uniformCats);
      if (uniformSz.length > 0) setUniformSizes(uniformSz);
      setStorageBins(bins);
      setRequireBinLocations(requireBins.length > 0 ? requireBins : ['Store']);
    } catch {
      setLocations(DEFAULT_LOCATIONS);
      setStockCategories(DEFAULT_STOCK_CATEGORIES);
      setToolCategories(DEFAULT_TOOL_CATEGORIES);
      setUniformCategories(DEFAULT_UNIFORM_CATEGORIES);
      setUniformSizes(DEFAULT_UNIFORM_SIZES);
    }
  }, [token]);

  const saveListOptions = async () => {
    if (!token) return;
    setSavingListSettings(true);
    setErrorMsg(null);
    try {
      const location_options = locationDraft.split('\n').map((line) => line.trim()).filter(Boolean);
      const stock_category_options = stockCategoryDraft.split('\n').map((line) => line.trim()).filter(Boolean);
      const tool_category_options = toolCategoryDraft.split('\n').map((line) => line.trim()).filter(Boolean);
      const uniform_category_options = uniformCategoryDraft.split('\n').map((line) => line.trim()).filter(Boolean);
      const uniform_size_options = uniformSizeDraft.split('\n').map((line) => line.trim()).filter(Boolean);
      const storage_bin_options = storageBinDraft.split('\n').map((line) => line.trim()).filter(Boolean);
      const require_bin_for_locations = requireBinDraft.split('\n').map((line) => line.trim()).filter(Boolean);
      if (
        location_options.length === 0
        || stock_category_options.length === 0
        || tool_category_options.length === 0
        || uniform_category_options.length === 0
        || uniform_size_options.length === 0
      ) {
        setErrorMsg('Each list needs at least one entry.');
        return;
      }
      const res = await patchJson<{
        location_options: string[];
        stock_category_options: string[];
        tool_category_options: string[];
        uniform_category_options: string[];
        uniform_size_options: string[];
        storage_bin_options: string[];
        require_bin_for_locations: string[];
      }>('/settings/stock-tools', {
        location_options,
        stock_category_options,
        tool_category_options,
        uniform_category_options,
        uniform_size_options,
        storage_bin_options,
        require_bin_for_locations: require_bin_for_locations.length > 0 ? require_bin_for_locations : ['Store'],
      }, token);
      setLocations(res.location_options);
      setStockCategories(res.stock_category_options);
      setToolCategories(res.tool_category_options);
      setUniformCategories(res.uniform_category_options);
      setUniformSizes(res.uniform_size_options);
      setStorageBins(res.storage_bin_options ?? []);
      setRequireBinLocations(res.require_bin_for_locations ?? ['Store']);
      setShowListSettings(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save list options');
    } finally {
      setSavingListSettings(false);
    }
  };

  const openListSettings = () => {
    setLocationDraft(locations.join('\n'));
    setStockCategoryDraft(stockCategories.join('\n'));
    setToolCategoryDraft(toolCategories.join('\n'));
    setUniformCategoryDraft(uniformCategories.join('\n'));
    setUniformSizeDraft(uniformSizes.join('\n'));
    setStorageBinDraft(storageBins.join('\n'));
    setRequireBinDraft(requireBinLocations.join('\n'));
    setShowListSettings(true);
  };

  const copyPlacementLabel = async (key: string, label: string) => {
    try {
      await navigator.clipboard.writeText(label);
      setCopiedPlacementKey(key);
      setTimeout(() => setCopiedPlacementKey((current) => (current === key ? null : current)), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const fetchOfficers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getJson<{ officers: Officer[] }>('/officers/list', token);
      setOfficers(data?.officers || []);
    } catch (err) {
      console.error('Error fetching officers:', err);
    }
  }, [token]);

  const fetchStock = useCallback(async () => {
    if (!token) return;
    setLoadingStock(true);
    try {
      const data = await getJson<StockItem[]>('/stock', token);
      setStockItems(data || []);
      const txData = await getJson<StockTransaction[]>('/stock/transactions', token);
      setTransactions(txData || []);
    } catch (err) {
      console.error('Error fetching stock:', err);
    } finally {
      setLoadingStock(false);
    }
  }, [token]);

  const fetchTools = useCallback(async () => {
    if (!token) return;
    setLoadingTools(true);
    try {
      const data = await getJson<Tool[]>('/tools', token);
      setTools(data || []);
    } catch (err) {
      console.error('Error fetching tools:', err);
    } finally {
      setLoadingTools(false);
    }
  }, [token]);

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    setLoadingAnalytics(true);
    try {
      const data = await getJson<Analytics>('/stock-tools/analytics', token);
      setAnalytics(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOfficers();
    void fetchListOptions();
  }, [fetchOfficers, fetchListOptions]);

  useEffect(() => {
    if (activeTab === 'stock') {
      fetchStock();
    } else if (activeTab === 'tools') {
      fetchTools();
    } else if (activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [activeTab, fetchStock, fetchTools, fetchAnalytics]);

  // --- Stock Actions ---
  const handleOpenAddStock = () => {
    setEditingStockItem(null);
    setStockForm({
      name: '',
      mpn: '',
      quantity: '0',
      category: stockCategories[0] ?? 'General',
      quality: 'New',
      location: locations[0] || 'Store',
      locations: [emptyPlacementFormRow(locations[0] || 'Store')],
      image_base64: '',
      original_filename: '',
      content_type: '',
    });
    setErrorMsg(null);
    setShowStockModal(true);
  };

  const handleOpenEditStock = (item: StockItem) => {
    setEditingStockItem(item);
    const initialLocs = parsePlacementsFromItem(item).map(placementFormFromApi);

    setStockForm({
      name: item.name,
      mpn: item.mpn || '',
      quantity: String(item.quantity),
      category: item.category,
      quality: item.quality,
      location: item.location,
      locations: initialLocs,
      image_base64: '',
      original_filename: '',
      content_type: '',
    });
    setErrorMsg(null);
    setShowStockModal(true);
  };

  const handleStockFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await fileToDataUrl(file);
      setStockForm((prev) => ({
        ...prev,
        image_base64: base64,
        original_filename: file.name,
        content_type: file.type,
      }));
    } catch (err) {
      console.error('File load error:', err);
    }
  };

  const handleSaveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setErrorMsg(null);

    const parsedLocations = stockForm.locations.map(placementFormToApi);

    if (parsedLocations.some((l) => isNaN(l.quantity) || l.quantity < 0)) {
      setErrorMsg('All placement quantities must be 0 or greater');
      return;
    }

    const binError = validatePlacementsRequireBin(parsedLocations, requireBinLocations);
    if (binError) {
      setErrorMsg(binError);
      return;
    }

    const payload = {
      name: stockForm.name.trim(),
      mpn: stockForm.mpn.trim() || null,
      category: stockForm.category,
      quality: stockForm.quality,
      locations: parsedLocations,
      ...(stockForm.image_base64
        ? imageUploadFields(
            stockForm.image_base64,
            stockForm.original_filename,
            stockForm.content_type,
          )
        : {}),
    };

    if (!payload.name) {
      setErrorMsg('Name is required');
      return;
    }

    try {
      if (editingStockItem) {
        await patchJson(`/stock/${editingStockItem.id}`, payload, token);
      } else {
        await postJson('/stock', payload, token);
      }
      setShowStockModal(false);
      fetchStock();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving stock item');
    }
  };

  const handleDeleteStock = async (itemId: number) => {
    if (!token) return;
    if (!confirm('Are you sure you want to delete this stock item? This will also remove its history logs.')) return;
    try {
      await deleteRequest(`/stock/${itemId}`, token);
      fetchStock();
    } catch (err: any) {
      alert(err.message || 'Error deleting stock item');
    }
  };

  // --- Tool Actions ---
  const handleOpenAddTool = () => {
    setEditingTool(null);
    setToolForm({
      name: '',
      category: toolCategories[0] ?? 'Other',
      quantity: '1',
      status: 'available',
      location: 'Store',
      zone: '',
      aisle: '',
      shelf: '',
      box: '',
      storage_code: '',
      location_notes: '',
      assigned_officer_id: '',
      image_base64: '',
      original_filename: '',
      content_type: '',
    });
    setErrorMsg(null);
    setShowToolModal(true);
  };

  const handleOpenEditTool = (tool: Tool) => {
    setEditingTool(tool);
    setToolForm({
      name: tool.name,
      category: tool.category,
      quantity: String(tool.quantity ?? 1),
      status: tool.status,
      location: tool.location,
      zone: tool.zone ?? '',
      aisle: tool.aisle ?? '',
      shelf: tool.shelf ?? '',
      box: tool.box ?? '',
      storage_code: tool.storage_code ?? '',
      location_notes: tool.location_notes ?? '',
      assigned_officer_id: tool.assigned_officer_id ? String(tool.assigned_officer_id) : '',
      image_base64: '',
      original_filename: '',
      content_type: '',
    });
    setErrorMsg(null);
    setShowToolModal(true);
  };

  const handleToolFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await fileToDataUrl(file);
      setToolForm((prev) => ({
        ...prev,
        image_base64: base64,
        original_filename: file.name,
        content_type: file.type,
      }));
    } catch (err) {
      console.error('File load error:', err);
    }
  };

  const handleSaveTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setErrorMsg(null);

    const qty = parseInt(toolForm.quantity, 10);
    const payload = {
      name: toolForm.name.trim(),
      category: toolForm.category,
      quantity: qty,
      status: toolForm.status,
      location: toolForm.location,
      zone: toolForm.zone.trim() || null,
      aisle: toolForm.aisle.trim() || null,
      shelf: toolForm.shelf.trim() || null,
      box: toolForm.box.trim() || null,
      storage_code: toolForm.storage_code.trim() || null,
      location_notes: toolForm.location_notes.trim() || null,
      assigned_officer_id: toolForm.assigned_officer_id ? parseInt(toolForm.assigned_officer_id, 10) : null,
      ...(toolForm.image_base64
        ? imageUploadFields(toolForm.image_base64, toolForm.original_filename, toolForm.content_type)
        : {}),
    };

    if (!payload.name) {
      setErrorMsg('Name is required');
      return;
    }
    if (isNaN(qty) || qty < 1) {
      setErrorMsg('Quantity must be at least 1');
      return;
    }

    try {
      if (editingTool) {
        await patchJson(`/tools/${editingTool.id}`, payload, token);
      } else {
        await postJson('/tools', payload, token);
      }
      setShowToolModal(false);
      fetchTools();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving tool');
    }
  };

  const handleDeleteTool = async (toolId: number) => {
    if (!token) return;
    if (!confirm('Are you sure you want to delete this tool?')) return;
    try {
      await deleteRequest(`/tools/${toolId}`, token);
      fetchTools();
    } catch (err: any) {
      alert(err.message || 'Error deleting tool');
    }
  };

  const openConvertToTool = (item: StockItem) => {
    setConvertStockItem(item);
    setConvertToToolQty('1');
    setErrorMsg(null);
    setShowConvertToToolModal(true);
  };

  const handleConvertToTool = async () => {
    if (!token || !convertStockItem) return;
    const qty = parseInt(convertToToolQty, 10);
    if (isNaN(qty) || qty < 1) {
      setErrorMsg('Enter a valid quantity');
      return;
    }
    if (qty > convertStockItem.quantity) {
      setErrorMsg(`Only ${convertStockItem.quantity} unit(s) in stock`);
      return;
    }
    setConvertingToTool(true);
    setErrorMsg(null);
    try {
      await postJson(`/stock/${convertStockItem.id}/convert-to-tool`, { quantity: qty }, token);
      setShowConvertToToolModal(false);
      setConvertStockItem(null);
      await fetchStock();
      await fetchTools();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not convert to tool');
    } finally {
      setConvertingToTool(false);
    }
  };

  const openConvertToStock = (tool: Tool) => {
    setConvertToolItem(tool);
    setConvertToStockQty(String(tool.quantity ?? 1));
    setConvertToStockCategory(stockCategories[0] ?? 'General');
    setConvertToStockQuality('Used - Good');
    setErrorMsg(null);
    setShowConvertToStockModal(true);
  };

  const handleConvertToStock = async () => {
    if (!token || !convertToolItem) return;
    const qty = parseInt(convertToStockQty, 10);
    if (isNaN(qty) || qty < 1) {
      setErrorMsg('Enter a valid quantity');
      return;
    }
    if (qty > (convertToolItem.quantity ?? 1)) {
      setErrorMsg(`Only ${convertToolItem.quantity ?? 1} unit(s) for this tool`);
      return;
    }
    setConvertingToStock(true);
    setErrorMsg(null);
    try {
      await postJson(
        `/tools/${convertToolItem.id}/convert-to-stock`,
        { quantity: qty, category: convertToStockCategory, quality: convertToStockQuality },
        token,
      );
      setShowConvertToStockModal(false);
      setConvertToolItem(null);
      await fetchTools();
      await fetchStock();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not convert to stock');
    } finally {
      setConvertingToStock(false);
    }
  };

  const stockCategoryOptions = useMemo(() => {
    const set = new Set(stockCategories);
    stockItems.forEach((i) => { if (i.category) set.add(i.category); });
    return [...set].sort();
  }, [stockCategories, stockItems]);

  const toolCategoryOptions = useMemo(() => {
    const set = new Set(toolCategories);
    tools.forEach((t) => { if (t.category) set.add(t.category); });
    return [...set].sort();
  }, [toolCategories, tools]);

  // --- Filtering Logic ---
  const filteredStock = stockItems.filter((item) => {
    const placements = parsePlacementsFromItem(item);
    const locationsList = placements.map((l) => l.location);
    const searchLower = stockSearch.toLowerCase();

    const matchesSearch =
      item.name.toLowerCase().includes(searchLower) ||
      (item.mpn || '').toLowerCase().includes(searchLower) ||
      locationsList.some((loc) => loc.toLowerCase().includes(searchLower)) ||
      placements.some((p) => placementSearchBlob(p).includes(searchLower));
    const matchesCategory = stockCategoryFilter === 'All' || item.category === stockCategoryFilter;
    const matchesLocation = stockLocationFilter === 'All' || locationsList.includes(stockLocationFilter);
    return matchesSearch && matchesCategory && matchesLocation;
  });

  const filteredTools = tools.filter((tool) => {
    const matchesSearch =
      tool.name.toLowerCase().includes(toolsSearch.toLowerCase()) ||
      tool.location.toLowerCase().includes(toolsSearch.toLowerCase()) ||
      (tool.assigned_officer_name || '').toLowerCase().includes(toolsSearch.toLowerCase());
    const matchesCategory = toolsCategoryFilter === 'All' || tool.category === toolsCategoryFilter;
    const matchesStatus = toolsStatusFilter === 'All' || tool.status === toolsStatusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stock, Tools &amp; Uniform</h1>
          <p className="text-sm text-slate-500">Track parts inventory, company tools, staff uniforms, and usage analytics.</p>
        </div>

        {/* Tab Selection */}
        <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200 w-fit">
          <button
            onClick={() => setActiveTab('stock')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'stock'
                ? 'bg-[#14B8A6] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Package className="size-4" />
            Stock Inventory
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'tools'
                ? 'bg-[#14B8A6] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Wrench className="size-4" />
            Tools Registry
          </button>
          <button
            onClick={() => setActiveTab('uniforms')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'uniforms'
                ? 'bg-[#14B8A6] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Shirt className="size-4" />
            Uniform Registry
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'analytics'
                ? 'bg-[#14B8A6] text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <TrendingUp className="size-4" />
            Usage Analytics
          </button>
        </div>
      </div>

      {/* ─── TAB CONTENT: STOCK ─── */}
      {activeTab === 'stock' && (
        <div className="flex flex-col gap-6">
          {/* Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, MPN, box, aisle, shelf..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]"
                />
              </div>

              <select
                value={stockCategoryFilter}
                onChange={(e) => setStockCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              >
                <option value="All">All Categories</option>
                {stockCategoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                value={stockLocationFilter}
                onChange={(e) => setStockLocationFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              >
                <option value="All">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openListSettings}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Manage lists
              </button>
              <button
                onClick={handleOpenAddStock}
                className="flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm transition animate-press"
              >
                <Plus className="size-4" /> Add Part to Stock
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Grid of Parts */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {loadingStock ? (
                <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400">
                  Loading stock catalog...
                </div>
              ) : filteredStock.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400 gap-2">
                  <Package className="size-8 text-slate-300" />
                  <p className="text-sm font-medium">No stock items match your criteria.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredStock.map((item) => {
                    const isLow = item.quantity > 0 && item.quantity <= 5;
                    const isOut = item.quantity === 0;
                    const placements = parsePlacementsFromItem(item);

                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-[#14B8A6]/40 transition"
                      >
                        <div>
                          {/* Image preview & Header */}
                          <div className="flex gap-4 mb-3">
                            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                              {item.image_url && activeToken ? (
                                <AuthenticatedStockImage
                                  imageUrl={item.image_url}
                                  category="stock-photos"
                                  token={activeToken}
                                  alt={item.name}
                                  className="size-full object-cover"
                                  fallback={
                                    <div className="flex size-full items-center justify-center text-slate-300">
                                      <Package className="size-6" />
                                    </div>
                                  }
                                />
                              ) : (
                                <div className="flex size-full items-center justify-center text-slate-300">
                                  <Package className="size-6" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                {item.category}
                              </span>
                              <h3 className="font-bold text-slate-900 truncate mt-1">{item.name}</h3>
                              <p className="text-xs text-slate-500 truncate">MPN: {item.mpn || 'N/A'}</p>
                            </div>
                          </div>

                          {/* Stats Info */}
                          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs border border-slate-100">
                            <div>
                              <p className="text-slate-400 font-semibold mb-0.5">Sites</p>
                              <p className="font-bold text-slate-700 truncate" title={placements.map((l) => l.location).join(', ')}>
                                {[...new Set(placements.map((l) => l.location))].join(', ')}
                              </p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-semibold mb-0.5">Quality</p>
                              <p className="font-bold text-slate-700 truncate">{item.quality}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 font-semibold mb-0.5">Stock Level</p>
                              <p className={`font-bold ${isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-[#14B8A6]'}`}>
                                {item.quantity} units
                              </p>
                            </div>
                          </div>

                          {placements.length > 0 && (
                            <div className="mt-3 rounded-xl border border-slate-100 bg-white p-2.5">
                              <div className="flex items-center gap-1.5 mb-2">
                                <MapPin className="size-3.5 text-[#14B8A6]" />
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                  Where is it? ({placements.length})
                                </p>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                {placements.map((placement, pIdx) => {
                                  const label = formatPlacementLabel(placement);
                                  const copyKey = `${item.id}-${pIdx}`;
                                  return (
                                    <div
                                      key={copyKey}
                                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 border border-slate-100"
                                    >
                                      <p className="text-xs font-semibold text-slate-700 truncate" title={label}>
                                        {label}
                                      </p>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-xs font-bold text-[#14B8A6]">×{placement.quantity}</span>
                                        <button
                                          type="button"
                                          onClick={() => void copyPlacementLabel(copyKey, label)}
                                          className="rounded p-1 text-slate-400 hover:bg-white hover:text-[#14B8A6] transition"
                                          title="Copy location"
                                        >
                                          <Copy className="size-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {copiedPlacementKey?.startsWith(`${item.id}-`) && (
                                <p className="mt-1.5 text-[10px] font-semibold text-emerald-600">Copied to clipboard</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Badges / Alerts & Actions */}
                        <div className="flex items-center justify-between border-t border-slate-100 mt-4 pt-3">
                          <div>
                            {isOut && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-100">
                                <AlertTriangle className="size-3" /> Out of Stock
                              </span>
                            )}
                            {isLow && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-100">
                                <AlertTriangle className="size-3" /> Low Stock
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                            {item.quantity > 0 && (
                              <button
                                onClick={() => openConvertToTool(item)}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition"
                                title="Convert to tool"
                              >
                                <ArrowRightLeft className="size-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEditStock(item)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                              title="Edit Part"
                            >
                              <Edit2 className="size-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteStock(item.id)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                              title="Delete Part"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar: Transaction History Log */}
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <History className="size-5 text-[#14B8A6]" />
                <div>
                  <h3 className="font-bold text-slate-900">Inventory Logs</h3>
                  <p className="text-xs text-slate-500">Real-time usage and restocking tracking.</p>
                </div>
              </div>

              <div className="flex flex-col gap-4 overflow-y-auto max-h-[500px] pr-1">
                {loadingStock ? (
                  <div className="text-center py-6 text-slate-400 text-sm">Loading logs...</div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">No transaction logs available.</div>
                ) : (
                  transactions.slice(0, 50).map((tx) => {
                    const isConsumption = tx.transaction_type === 'consume';
                    const isReverse = tx.transaction_type === 'reverse';
                    const isRestock = tx.transaction_type === 'restock';

                    let typeLabel = 'Adjustment';
                    let typeClass = 'bg-slate-100 text-slate-700';
                    let qPrefix = '';
                    if (isConsumption) {
                      typeLabel = 'Consumed';
                      typeClass = 'bg-rose-50 text-rose-700 border border-rose-100';
                      qPrefix = '-';
                    } else if (isReverse) {
                      typeLabel = 'Returned';
                      typeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
                      qPrefix = '+';
                    } else if (isRestock) {
                      typeLabel = 'Restocked';
                      typeClass = 'bg-blue-50 text-blue-700 border border-blue-100';
                      qPrefix = '+';
                    }

                    return (
                      <div key={tx.id} className="text-xs border-b border-slate-50 pb-3 last:border-b-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-bold text-slate-800 break-words flex-1">
                            {tx.item_name}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${typeClass}`}>
                            {qPrefix}
                            {tx.quantity} units
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-slate-400">
                          <span>{typeLabel}</span>
                          <span>•</span>
                          <span>{tx.user_name}</span>
                          <span>•</span>
                          <span>{new Date(tx.created_at).toLocaleDateString()}</span>
                        </div>
                        {tx.job_number && (
                          <div className="mt-1 flex items-center gap-1 text-slate-500 font-medium">
                            <FileText className="size-3" />
                            Job #{tx.job_number}
                          </div>
                        )}
                        {tx.notes && <p className="mt-1 italic text-slate-500">{tx.notes}</p>}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB CONTENT: TOOLS ─── */}
      {activeTab === 'tools' && (
        <div className="flex flex-col gap-6">
          {/* Controls */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tools, custodian, location..."
                  value={toolsSearch}
                  onChange={(e) => setToolsSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-1 focus:ring-[#14B8A6]"
                />
              </div>

              <select
                value={toolsCategoryFilter}
                onChange={(e) => setToolsCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              >
                <option value="All">All Categories</option>
                {toolCategoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                value={toolsStatusFilter}
                onChange={(e) => setToolsStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
              >
                <option value="All">All Statuses</option>
                <option value="available">Available</option>
                <option value="in_use">In Use</option>
                <option value="damaged">Damaged</option>
                <option value="missing">Missing</option>
              </select>
            </div>

            <button
              type="button"
              onClick={openListSettings}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Manage lists
            </button>
            <button
              onClick={handleOpenAddTool}
              className="flex items-center justify-center gap-2 rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm transition animate-press"
            >
              <Plus className="size-4" /> Add Tool to Registry
            </button>
          </div>

          {/* Grid of Tools */}
          {loadingTools ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400">
              Loading tools registry...
            </div>
          ) : filteredTools.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400 gap-2">
              <Wrench className="size-8 text-slate-300" />
              <p className="text-sm font-medium">No tools match your filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTools.map((tool) => {
                let statusClass = 'bg-slate-100 text-slate-700';
                let statusLabel = 'Available';
                if (tool.status === 'in_use') {
                  statusClass = 'bg-blue-100 text-blue-800';
                  statusLabel = 'In Use';
                } else if (tool.status === 'damaged') {
                  statusClass = 'bg-amber-100 text-amber-800';
                  statusLabel = 'Damaged';
                } else if (tool.status === 'missing') {
                  statusClass = 'bg-rose-100 text-rose-800';
                  statusLabel = 'Missing';
                } else if (tool.status === 'available') {
                  statusClass = 'bg-emerald-100 text-emerald-800';
                  statusLabel = 'Available';
                }

                return (
                  <div
                    key={tool.id}
                    className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-[#14B8A6]/40 transition"
                  >
                    <div>
                      <div className="flex gap-4 mb-3">
                        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                          {tool.image_url && activeToken ? (
                            <AuthenticatedStockImage
                              imageUrl={tool.image_url}
                              category="tool-photos"
                              token={activeToken}
                              alt={tool.name}
                              className="size-full object-cover"
                              fallback={
                                <div className="flex size-full items-center justify-center text-slate-300">
                                  <Wrench className="size-6" />
                                </div>
                              }
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-slate-300">
                              <Wrench className="size-6" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            {tool.category}
                          </span>
                          <h3 className="font-bold text-slate-900 truncate mt-1">{tool.name}</h3>
                          <p className="text-xs text-slate-500 truncate">
                            Custodian: {tool.assigned_officer_name || 'None Assigned'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs border border-slate-100">
                        <div>
                          <p className="text-slate-400 font-semibold mb-0.5">Location</p>
                          <p className="font-bold text-slate-700 truncate" title={tool.location}>
                            {tool.location}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-semibold mb-0.5">Quantity</p>
                          <p className="font-bold text-slate-700 truncate">{tool.quantity ?? 1}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-semibold mb-0.5">Status</p>
                          <p className="font-bold text-slate-700 truncate">{statusLabel}</p>
                        </div>
                      </div>

                      {(() => {
                        const placementLabel = formatPlacementLabel({
                          location: tool.location,
                          quantity: tool.quantity ?? 0,
                          zone: tool.zone ?? undefined,
                          aisle: tool.aisle ?? undefined,
                          shelf: tool.shelf ?? undefined,
                          box: tool.box ?? undefined,
                          storage_code: tool.storage_code ?? undefined,
                        } as StockPlacement);
                        if (placementLabel === tool.location) return null;
                        return (
                          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs text-teal-800 border border-teal-100">
                            <MapPin className="size-3.5 shrink-0" />
                            <span className="truncate" title={placementLabel}>{placementLabel}</span>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 mt-4 pt-3">
                      <div>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                        <button
                          onClick={() => openConvertToStock(tool)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition"
                          title="Convert to stock"
                        >
                          <ArrowRightLeft className="size-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditTool(tool)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                          title="Edit Tool"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTool(tool.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Delete Tool"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'uniforms' && (
        <UniformTab
          token={token}
          activeToken={activeToken}
          officers={officers}
          locations={locations}
          uniformCategories={uniformCategories}
          uniformSizes={uniformSizes}
          onManageLists={openListSettings}
        />
      )}

      {/* ─── TAB CONTENT: ANALYTICS ─── */}
      {activeTab === 'analytics' && (
        <div className="flex flex-col gap-6">
          {loadingAnalytics || !analytics ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-slate-400">
              Loading usage analytics...
            </div>
          ) : (
            <>
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div className="rounded-xl bg-[#14B8A6]/10 p-3 text-[#14B8A6]">
                    <Package className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Stock Items</p>
                    <p className="text-2xl font-black text-slate-900">{analytics.stockCount}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div className="rounded-xl bg-amber-50 p-3 text-amber-600 border border-amber-100">
                    <AlertTriangle className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Low Stock warnings</p>
                    <p className="text-2xl font-black text-slate-900">{analytics.lowStockCount}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div className="rounded-xl bg-rose-50 p-3 text-rose-600 border border-rose-100">
                    <AlertTriangle className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Out of Stock items</p>
                    <p className="text-2xl font-black text-slate-900">{analytics.outOfStockCount}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div className="rounded-xl bg-blue-50 p-3 text-blue-600 border border-blue-100">
                    <Wrench className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Registered Tools</p>
                    <p className="text-2xl font-black text-slate-900">{analytics.toolsCount}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                  <div className="rounded-xl bg-violet-50 p-3 text-violet-600 border border-violet-100">
                    <Shirt className="size-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Uniform Items</p>
                    <p className="text-2xl font-black text-slate-900">{analytics.uniformsCount ?? 0}</p>
                    {analytics.uniformsByStatus && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {analytics.uniformsByStatus.issued} issued · {analytics.uniformsByStatus.available} available
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Analytics Dashboard Visualizations */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* SVG usage chart */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Category Usage Rates vs Current Stock</h3>
                    <p className="text-xs text-slate-400 mb-6">Compares overall quantities used on jobs versus quantities currently available.</p>
                  </div>

                  <div className="relative w-full h-72 flex flex-col justify-between border-l border-b border-slate-200 pl-4 pb-2">
                    {analytics.categoryStats.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs">
                        No usage data available to graph.
                      </div>
                    ) : (
                      analytics.categoryStats.map((stat, i) => {
                        const maxVal = Math.max(...analytics.categoryStats.map(s => Math.max(s.total_used, s.current_stock, 1)));
                        const usedPct = (stat.total_used / maxVal) * 100;
                        const stockPct = (stat.current_stock / maxVal) * 100;

                        return (
                          <div key={i} className="flex flex-col gap-1 w-full my-1">
                            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                              <span>{stat.category}</span>
                              <span className="text-slate-400 font-semibold">
                                Used: {stat.total_used} | Stock: {stat.current_stock}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 w-full bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                              {/* Used bar */}
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 rounded bg-rose-400 transition-all duration-500"
                                  style={{ width: `${Math.max(usedPct, 2)}%` }}
                                />
                                <span className="text-[10px] text-slate-400">Used</span>
                              </div>
                              {/* Stock bar */}
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 rounded bg-emerald-400 transition-all duration-500"
                                  style={{ width: `${Math.max(stockPct, 2)}%` }}
                                />
                                <span className="text-[10px] text-slate-400">Available</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Replenishment Checklist & Recommendations */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Replenishment Recommendations</h3>
                    <p className="text-xs text-slate-400 mb-4">Stock items requiring immediate orders.</p>
                  </div>

                  <div className="flex-1 flex flex-col gap-3 overflow-y-auto max-h-[220px] mb-4 pr-1">
                    {stockItems.filter(item => item.quantity <= 5).length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-xs">
                        All stock items are well supplied! No replenishment orders needed.
                      </div>
                    ) : (
                      stockItems
                        .filter(item => item.quantity <= 5)
                        .map(item => (
                          <div key={item.id} className="flex items-center justify-between border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                            <div>
                              <p className="text-sm font-bold text-slate-800 leading-snug">{item.name}</p>
                              <p className="text-xs text-slate-400">
                                {parsePlacementsFromItem(item).map((l) => `${formatPlacementLabel(l)} (${l.quantity})`).join(' · ')} • {item.category}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                                item.quantity === 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                                {item.quantity === 0 ? 'Out' : `${item.quantity} Left`}
                              </span>
                            </div>
                          </div>
                        ))
                    )}
                  </div>

                  <div className="rounded-xl bg-[#14B8A6]/5 p-4 border border-[#14B8A6]/10">
                    <h4 className="text-xs font-bold text-[#14B8A6] uppercase tracking-wider mb-1">Ordering Insight</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Based on usage, the most consumed category is{' '}
                      <strong>
                        {analytics.categoryStats.length > 0
                          ? analytics.categoryStats.reduce((max, s) => (s.total_used > max.total_used ? s : max), analytics.categoryStats[0]).category
                          : 'N/A'}
                      </strong>
                      . Plan bulk purchases for this category to benefit from volume discounts and ensure engineers have required parts on-site.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── STOCK MODAL ─── */}
      {showStockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingStockItem ? 'Edit Stock Item' : 'Add Stock Item'}
              </h2>
              <button
                onClick={() => setShowStockModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStock} className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
              {errorMsg && (
                <div className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-100 flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Part Name *</label>
                <input
                  type="text"
                  required
                  value={stockForm.name}
                  onChange={(e) => setStockForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. 13A Double Socket Outlet"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">MPN / Part Number</label>
                  <input
                    type="text"
                    value={stockForm.mpn}
                    onChange={(e) => setStockForm((prev) => ({ ...prev, mpn: e.target.value }))}
                    placeholder="e.g. SF2000"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Category</label>
                  <select
                    value={stockForm.category}
                    onChange={(e) => setStockForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    {stockCategoryOptions.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Quality</label>
                  <select
                    value={stockForm.quality}
                    onChange={(e) => setStockForm((prev) => ({ ...prev, quality: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    {QUALITIES.map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Storage placements */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Storage placements</label>
                  <button
                    type="button"
                    onClick={() => {
                      setStockForm(prev => ({
                        ...prev,
                        locations: [...prev.locations, emptyPlacementFormRow(locations[0] || 'Store')]
                      }));
                    }}
                    className="text-xs font-bold text-[#14B8A6] hover:underline flex items-center gap-1"
                  >
                    <Plus className="size-3.5" /> Add placement
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mb-3">
                  Record site, aisle, shelf, and box/cell so warehouse staff can find parts quickly.
                  {requireBinLocations.length > 0 && (
                    <> Box or storage code required for: {requireBinLocations.join(', ')}.</>
                  )}
                </p>
                <div className="flex flex-col gap-3">
                  {stockForm.locations.map((loc, index) => (
                    <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 animate-fadeIn">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Site</label>
                          <select
                            value={loc.location}
                            onChange={(e) => {
                              const newLocs = [...stockForm.locations];
                              newLocs[index] = { ...newLocs[index], location: e.target.value };
                              setStockForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          >
                            {locations.map(l => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Zone</label>
                          <input
                            value={loc.zone}
                            onChange={(e) => {
                              const newLocs = [...stockForm.locations];
                              newLocs[index] = { ...newLocs[index], zone: e.target.value };
                              setStockForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            placeholder="WH-A"
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Aisle</label>
                          <input
                            value={loc.aisle}
                            onChange={(e) => {
                              const newLocs = [...stockForm.locations];
                              newLocs[index] = { ...newLocs[index], aisle: e.target.value };
                              setStockForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            placeholder="3"
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Shelf</label>
                          <input
                            value={loc.shelf}
                            onChange={(e) => {
                              const newLocs = [...stockForm.locations];
                              newLocs[index] = { ...newLocs[index], shelf: e.target.value };
                              setStockForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            placeholder="B"
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Box / Cell</label>
                          <input
                            value={loc.box}
                            list={storageBins.length > 0 ? 'storage-bin-suggestions' : undefined}
                            onChange={(e) => {
                              const newLocs = [...stockForm.locations];
                              newLocs[index] = { ...newLocs[index], box: e.target.value };
                              setStockForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            placeholder="14"
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Storage code</label>
                          <input
                            value={loc.storage_code}
                            list={storageBins.length > 0 ? 'storage-bin-suggestions' : undefined}
                            onChange={(e) => {
                              const newLocs = [...stockForm.locations];
                              newLocs[index] = { ...newLocs[index], storage_code: e.target.value };
                              setStockForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            placeholder="A3-B-14"
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-400">Qty</label>
                          <input
                            type="number"
                            min="0"
                            required
                            value={loc.quantity}
                            onChange={(e) => {
                              const newLocs = [...stockForm.locations];
                              newLocs[index] = { ...newLocs[index], quantity: e.target.value };
                              setStockForm(prev => ({ ...prev, locations: newLocs }));
                            }}
                            className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                          />
                        </div>
                        <div className="flex justify-end">
                          {stockForm.locations.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setStockForm(prev => ({
                                  ...prev,
                                  locations: prev.locations.filter((_, i) => i !== index)
                                }));
                              }}
                              className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 transition"
                              title="Remove placement"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        value={loc.notes}
                        onChange={(e) => {
                          const newLocs = [...stockForm.locations];
                          newLocs[index] = { ...newLocs[index], notes: e.target.value };
                          setStockForm(prev => ({ ...prev, locations: newLocs }));
                        }}
                        placeholder="Notes (optional) — e.g. top shelf, left side"
                        className="mt-2 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#14B8A6]"
                      />
                    </div>
                  ))}
                </div>
                {storageBins.length > 0 && (
                  <datalist id="storage-bin-suggestions">
                    {storageBins.map((bin) => (
                      <option key={bin} value={bin} />
                    ))}
                  </datalist>
                )}
              </div>

              {/* Photo Upload */}
              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Upload Part Picture</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center size-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 relative">
                    {stockForm.image_base64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={stockForm.image_base64} alt="Preview" className="size-full object-cover" />
                    ) : (editingStockItem?.image_url && activeToken) ? (
                      <AuthenticatedStockImage
                        imageUrl={editingStockItem.image_url}
                        category="stock-photos"
                        token={activeToken}
                        alt="Preview"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Upload className="size-6 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      id="stock-image-input"
                      onChange={handleStockFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="stock-image-input"
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-sm"
                    >
                      <Upload className="size-3.5" /> Select image
                    </label>
                    <p className="text-[10px] text-slate-400 mt-1">PNG, JPG, JPEG formats accepted.</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setShowStockModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm transition"
                >
                  Save Part
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── TOOL MODAL ─── */}
      {showToolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingTool ? 'Edit Tool Details' : 'Register New Tool'}
              </h2>
              <button
                onClick={() => setShowToolModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTool} className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
              {errorMsg && (
                <div className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700 border border-rose-100 flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Tool Name *</label>
                <input
                  type="text"
                  required
                  value={toolForm.name}
                  onChange={(e) => setToolForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. DeWalt DCD796 Hammer Drill"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Category</label>
                  <select
                    value={toolForm.category}
                    onChange={(e) => setToolForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    {toolCategoryOptions.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={toolForm.quantity}
                    onChange={(e) => setToolForm((prev) => ({ ...prev, quantity: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Location</label>
                  <select
                    value={toolForm.location}
                    onChange={(e) => setToolForm((prev) => ({ ...prev, location: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    {locations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Status</label>
                  <select
                    value={toolForm.status}
                    onChange={(e) => setToolForm((prev) => ({ ...prev, status: e.target.value as any }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  >
                    <option value="available">Available</option>
                    <option value="in_use">In Use</option>
                    <option value="damaged">Damaged</option>
                    <option value="missing">Missing</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
                <p className="text-[11px] text-slate-500">
                  Record zone, aisle, shelf, and box/cell so staff can quickly find this tool.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Zone</label>
                    <input
                      value={toolForm.zone}
                      onChange={(e) => setToolForm((prev) => ({ ...prev, zone: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Aisle</label>
                    <input
                      value={toolForm.aisle}
                      onChange={(e) => setToolForm((prev) => ({ ...prev, aisle: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Shelf</label>
                    <input
                      value={toolForm.shelf}
                      onChange={(e) => setToolForm((prev) => ({ ...prev, shelf: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Box / Cell</label>
                    <input
                      value={toolForm.box}
                      onChange={(e) => setToolForm((prev) => ({ ...prev, box: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Storage code</label>
                  <input
                    value={toolForm.storage_code}
                    onChange={(e) => setToolForm((prev) => ({ ...prev, storage_code: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Location notes</label>
                  <input
                    value={toolForm.location_notes}
                    onChange={(e) => setToolForm((prev) => ({ ...prev, location_notes: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Custodian (Officer)</label>
                <select
                  value={toolForm.assigned_officer_id}
                  onChange={(e) => setToolForm((prev) => ({ ...prev, assigned_officer_id: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]"
                >
                  <option value="">None Assigned</option>
                  {officers.map(off => (
                    <option key={off.id} value={off.id}>{off.full_name}</option>
                  ))}
                </select>
              </div>

              {/* Photo Upload */}
              <div className="border-t border-slate-100 pt-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Upload Tool Picture</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center size-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 relative">
                    {toolForm.image_base64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={toolForm.image_base64} alt="Preview" className="size-full object-cover" />
                    ) : (editingTool?.image_url && activeToken) ? (
                      <AuthenticatedStockImage
                        imageUrl={editingTool.image_url}
                        category="tool-photos"
                        token={activeToken}
                        alt="Preview"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Upload className="size-6 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      id="tool-image-input"
                      onChange={handleToolFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="tool-image-input"
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-sm"
                    >
                      <Upload className="size-3.5" /> Select image
                    </label>
                    <p className="text-[10px] text-slate-400 mt-1">PNG, JPG, JPEG formats accepted.</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setShowToolModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] shadow-sm transition"
                >
                  Save Tool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showListSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowListSettings(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">Inventory list options</h3>
            <p className="mt-1 text-sm text-slate-500">One entry per line. These power dropdown lists across stock, tools, and uniforms.</p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Locations</label>
                <textarea value={locationDraft} onChange={(e) => setLocationDraft(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock categories</label>
                <textarea value={stockCategoryDraft} onChange={(e) => setStockCategoryDraft(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Tool categories</label>
                <textarea value={toolCategoryDraft} onChange={(e) => setToolCategoryDraft(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Uniform types</label>
                <textarea value={uniformCategoryDraft} onChange={(e) => setUniformCategoryDraft(e.target.value)} rows={4} placeholder="Jacket&#10;Hi-Vis&#10;Fire Safety" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Storage bins (one per line)</label>
                <p className="mt-0.5 text-[11px] text-slate-500">Reusable bin labels for autocomplete when adding stock (e.g. A3-B-14, Van-Tote-1).</p>
                <textarea value={storageBinDraft} onChange={(e) => setStorageBinDraft(e.target.value)} rows={4} placeholder="A3-B-14&#10;A3-B-15&#10;Van-Tote-1" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Require box/code for sites</label>
                <p className="mt-0.5 text-[11px] text-slate-500">Sites where a box or storage code is mandatory when qty &gt; 0.</p>
                <textarea value={requireBinDraft} onChange={(e) => setRequireBinDraft(e.target.value)} rows={2} placeholder="Store" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Uniform sizes</label>
                <textarea value={uniformSizeDraft} onChange={(e) => setUniformSizeDraft(e.target.value)} rows={4} placeholder="XS&#10;S&#10;M&#10;L&#10;XL" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowListSettings(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={savingListSettings} onClick={() => void saveListOptions()} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-50">
                {savingListSettings ? 'Saving…' : 'Save lists'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConvertToToolModal && convertStockItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Convert stock to tool</h3>
            <p className="mt-1 text-sm text-slate-500">Move units from <strong>{convertStockItem.name}</strong> into tools ({convertStockItem.quantity} in stock).</p>
            {errorMsg && <div className="mt-3 rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700">{errorMsg}</div>}
            <div className="mt-4">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Quantity to convert</label>
              <input type="number" min={1} max={convertStockItem.quantity} value={convertToToolQty} onChange={(e) => setConvertToToolQty(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConvertToToolModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => void handleConvertToTool()} disabled={convertingToTool} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-60">{convertingToTool ? 'Converting…' : 'Convert to tool'}</button>
            </div>
          </div>
        </div>
      )}

      {showConvertToStockModal && convertToolItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Convert tool to stock</h3>
            <p className="mt-1 text-sm text-slate-500">Move units from <strong>{convertToolItem.name}</strong> into stock ({convertToolItem.quantity ?? 1} on hand).</p>
            {errorMsg && <div className="mt-3 rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700">{errorMsg}</div>}
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Quantity to convert</label>
                <input type="number" min={1} max={convertToolItem.quantity ?? 1} value={convertToStockQty} onChange={(e) => setConvertToStockQty(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Stock category</label>
                <select value={convertToStockCategory} onChange={(e) => setConvertToStockCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                  {stockCategoryOptions.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Quality</label>
                <select value={convertToStockQuality} onChange={(e) => setConvertToStockQuality(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6]">
                  {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConvertToStockModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => void handleConvertToStock()} disabled={convertingToStock} className="rounded-lg bg-[#14B8A6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d9488] disabled:opacity-60">{convertingToStock ? 'Converting…' : 'Convert to stock'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
