from abc import ABC, abstractmethod
import pandas as pd
import geopandas as gpd

class AllocationOperator(ABC):
    @property
    @abstractmethod
    def supported_geometries(self) -> list:
        pass

    def validate_geometry(self, source_gdf: gpd.GeoDataFrame):
        geom_types = source_gdf.geometry.geom_type.unique()
        for geom in geom_types:
            if geom not in self.supported_geometries:
                raise ValueError(f"Geometry {geom} not supported by {self.__class__.__name__}.")

    @abstractmethod
    def calculate_weights(self, source_gdf: gpd.GeoDataFrame, grid_gdf: gpd.GeoDataFrame) -> pd.DataFrame:
        pass