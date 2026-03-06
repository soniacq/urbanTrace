from abc import ABC, abstractmethod
import pandas as pd
import geopandas as gpd

class AggregationOperator(ABC):
    @abstractmethod
    def aggregate(self, weights_df: pd.DataFrame, grid_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
        pass